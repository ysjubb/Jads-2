pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // SQLCipher for Android is on Maven Central
        maven { url = uri("https://repo1.maven.org/maven2/") }
    }
}

rootProject.name = "JADS"
include(":app")
