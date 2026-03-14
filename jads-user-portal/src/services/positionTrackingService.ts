// T08 — Browser WebSocket client for live telemetry

export interface TelemetryPoint {
  missionId:      string
  uin:            string
  lat:            number
  lon:            number
  altAGL:         number
  altMSL:         number
  speedKmh:       number
  headingDeg:     number
  batteryPct:     number
  satelliteCount: number
  source:         string
  ts:             number
}

export interface ViolationEvent {
  point:          TelemetryPoint
  violationType:  string
  distanceToEdge: number
  ts:             number
}

type EventHandler<T> = (data: T) => void

export class PositionTrackingService {
  private ws: WebSocket | null = null
  private retryDelay = 1000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private _onTelemetry: EventHandler<TelemetryPoint> = () => {}
  private _onViolation: EventHandler<ViolationEvent> = () => {}
  private _onBatteryCritical: EventHandler<TelemetryPoint> = () => {}
  private _onStatusChange: EventHandler<string> = () => {}
  private _wsUrl = ''
  private _token = ''
  private _missionIds: string[] = []

  connect(wsUrl: string, token: string, missionIds: string[]) {
    this._wsUrl = wsUrl
    this._token = token
    this._missionIds = missionIds

    const url = `${wsUrl}/ws/missions?token=${token}&subscribe=${missionIds.join(',')}`
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.retryDelay = 1000
      this._onStatusChange('LIVE')
    }

    this.ws.onmessage = (e) => {
      try {
        this.handleMessage(JSON.parse(e.data))
      } catch { /* ignore parse errors */ }
    }

    this.ws.onclose = () => {
      this._onStatusChange('RECONNECTING')
      this.reconnectTimer = setTimeout(
        () => this.connect(this._wsUrl, this._token, this._missionIds),
        this.retryDelay,
      )
      this.retryDelay = Math.min(this.retryDelay * 2, 30000)
    }

    this.ws.onerror = () => {
      // onclose will fire after onerror
    }
  }

  private handleMessage(msg: { type: string; data: any }) {
    switch (msg.type) {
      case 'TELEMETRY_POINT':
        this._onTelemetry(msg.data)
        break
      case 'GEOFENCE_VIOLATION':
        this._onViolation(msg.data)
        break
      case 'BATTERY_CRITICAL':
        this._onBatteryCritical(msg.data)
        break
    }
  }

  setOnTelemetry(fn: EventHandler<TelemetryPoint>)        { this._onTelemetry = fn }
  setOnViolation(fn: EventHandler<ViolationEvent>)         { this._onViolation = fn }
  setOnBatteryCritical(fn: EventHandler<TelemetryPoint>)   { this._onBatteryCritical = fn }
  setOnStatusChange(fn: EventHandler<string>)              { this._onStatusChange = fn }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }
}
