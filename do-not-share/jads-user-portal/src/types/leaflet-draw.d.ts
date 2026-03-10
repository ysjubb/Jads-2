import 'leaflet'

declare module 'leaflet' {
  namespace Draw {
    namespace Event {
      const CREATED: string
      const EDITED: string
      const DELETED: string
    }
  }
}
