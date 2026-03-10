import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'in.gov.jads.userportal',
  appName: 'JADS',
  webDir: 'dist',
  server: {
    // In production, set this to your deployed backend URL.
    // For dev, the Vite proxy handles /api → localhost:8080.
    // On device, override via environment or live reload server:
    //   url: 'http://192.168.x.x:5175'
    androidScheme: 'https',
  },
  plugins: {
    Geolocation: {
      // Request background location for continuous GPS recording during flights
    },
    Camera: {
      // For photo evidence uploads if needed
    },
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
    },
  },
  ios: {
    // iOS-specific settings
  },
}

export default config
