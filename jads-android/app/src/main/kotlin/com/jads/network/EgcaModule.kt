package com.jads.network

import android.content.Context
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

// ─────────────────────────────────────────────────────────────────────────────
// EgcaModule — manual dependency injection wiring for the eGCA service layer.
//
// This project uses AppContainer-style manual DI (no Hilt/Koin).
// EgcaModule is a factory object that creates and wires:
//   1. EgcaTokenStore — EncryptedSharedPreferences for eGCA JWT
//   2. OkHttpClient with auth interceptor, logging, and timeouts
//   3. Retrofit instance pointed at the eGCA API base URL
//   4. EgcaApi interface implementation (Retrofit-generated)
//   5. EgcaRepository (suspend function layer with auto-reauth)
//   6. EgcaDataSource (local PA ZIP cache)
//
// Usage in AppContainer:
//   val egcaModule = EgcaModule.create(context)
//   val egcaRepo   = egcaModule.repository
//   val egcaCache  = egcaModule.dataSource
//
// Lifecycle: created once in AppContainer, all objects are singletons
// for the process lifetime.
//
// eGCA base URL:
//   Defaults to the Digital Sky staging environment.
//   Override via EgcaModule.create(baseUrl = "...").
//   Production: https://eservices.dgca.gov.in/egca/api/v2/
// ─────────────────────────────────────────────────────────────────────────────

/** Default eGCA API base URL (Digital Sky staging). */
private const val DEFAULT_EGCA_BASE_URL = "https://eservices.dgca.gov.in/egca/api/v2/"

/** Connect timeout — eGCA should be reachable within this window. */
private const val CONNECT_TIMEOUT_SECONDS = 15L

/** Read timeout — PA download (ZIP) may take longer on slow networks. */
private const val READ_TIMEOUT_SECONDS = 60L

/** Write timeout — flight log upload may be large. */
private const val WRITE_TIMEOUT_SECONDS = 60L

/**
 * Container for all eGCA-related dependencies.
 * Created by [EgcaModule.create].
 */
class EgcaDependencies(
    val api:        EgcaApi,
    val repository: EgcaRepository,
    val dataSource: EgcaDataSource,
    val tokenStore: EgcaTokenStore
)

object EgcaModule {

    /**
     * Create the full eGCA dependency graph.
     *
     * @param context Application context (for EncryptedSharedPreferences and file cache)
     * @param baseUrl eGCA API base URL. Defaults to DGCA Digital Sky staging.
     * @return [EgcaDependencies] containing api, repository, dataSource, and tokenStore
     */
    fun create(
        context: Context,
        baseUrl: String = DEFAULT_EGCA_BASE_URL
    ): EgcaDependencies {

        val tokenStore = EgcaTokenStore(context)
        val gson       = provideGson()
        val httpClient = provideOkHttpClient(tokenStore)
        val retrofit   = provideRetrofit(httpClient, gson, baseUrl)
        val api        = retrofit.create(EgcaApi::class.java)
        val repository = EgcaRepository(api, tokenStore)
        val dataSource = EgcaDataSource(context)

        return EgcaDependencies(
            api        = api,
            repository = repository,
            dataSource = dataSource,
            tokenStore = tokenStore
        )
    }

    // ── OkHttpClient ────────────────────────────────────────────────────────

    private fun provideOkHttpClient(tokenStore: EgcaTokenStore): OkHttpClient {
        return OkHttpClient.Builder()
            .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .writeTimeout(WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .addInterceptor(authInterceptor(tokenStore))
            .addInterceptor(userAgentInterceptor())
            .addInterceptor(loggingInterceptor())
            .build()
    }

    /**
     * Interceptor that adds the eGCA Bearer token to every request
     * EXCEPT the authentication endpoint itself.
     *
     * The token is read from EgcaTokenStore (EncryptedSharedPreferences)
     * at request time, ensuring the latest token is always used after a refresh.
     *
     * SECURITY: Raw token values are never logged by this interceptor.
     */
    private fun authInterceptor(tokenStore: EgcaTokenStore): Interceptor = Interceptor { chain ->
        val request  = chain.request()
        val path     = request.url.encodedPath

        // Do not add auth header to the authentication endpoint.
        if (path.contains("user/authenticate")) {
            return@Interceptor chain.proceed(request)
        }

        // Read the eGCA token from EncryptedSharedPreferences.
        val tokenPair = tokenStore.loadToken()
        val token     = tokenPair?.first

        val authenticatedRequest = if (token != null) {
            request.newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        } else {
            request
        }

        chain.proceed(authenticatedRequest)
    }

    /**
     * Interceptor that adds a User-Agent header identifying the JADS Android client.
     */
    private fun userAgentInterceptor(): Interceptor = Interceptor { chain ->
        val request = chain.request().newBuilder()
            .header("User-Agent", "JADS-Android/6.0")
            .header("Accept", "application/json")
            .build()
        chain.proceed(request)
    }

    /**
     * HTTP logging interceptor — BASIC level in all builds.
     * BASIC logs method + URL + response code (no headers, no body).
     * This avoids leaking JWT tokens in log output.
     */
    private fun loggingInterceptor(): HttpLoggingInterceptor {
        return HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }
    }

    // ── Retrofit ────────────────────────────────────────────────────────────

    private fun provideRetrofit(
        client:  OkHttpClient,
        gson:    Gson,
        baseUrl: String
    ): Retrofit {
        // Ensure base URL ends with a trailing slash (Retrofit requirement).
        val normalizedUrl = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"

        return Retrofit.Builder()
            .baseUrl(normalizedUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
    }

    // ── Gson ────────────────────────────────────────────────────────────────

    private fun provideGson(): Gson {
        return GsonBuilder()
            .setDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
            .create()
    }
}
