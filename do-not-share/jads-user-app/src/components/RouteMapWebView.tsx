/**
 * RouteMapWebView — renders a flight plan route on a Leaflet map inside a WebView.
 *
 * Uses CDN-loaded Leaflet (no native maps dependency) to show:
 *   - Blue polyline connecting all route points
 *   - Green ADEP marker with ICAO label
 *   - Red ADES marker with ICAO label
 *   - Amber intermediate waypoint dots
 *
 * Requires: react-native-webview (add to package.json if not present)
 */

import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { WebView } from 'react-native-webview'
import { T } from '../theme/theme'
import { fetchRouteGeometry, type RoutePoint } from '../api/flightPlanApi'

interface Props {
  flightPlanId: string
  adep: string
  ades: string
  height?: number
}

function buildMapHtml(points: RoutePoint[], adep: string, ades: string): string {
  const latlngs = points.map(p => `[${p.latDeg}, ${p.lonDeg}]`).join(',')
  const depPt = points[0]
  const arrPt = points[points.length - 1]
  const intermediates = points.slice(1, -1)

  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * { margin: 0; padding: 0; }
  body { background: ${T.bg}; }
  #map { width: 100%; height: 100vh; }
</style>
</head><body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '', maxZoom: 19
  }).addTo(map);

  var latlngs = [${latlngs}];
  L.polyline(latlngs, { color: '#4488FF', weight: 3, opacity: 0.85 }).addTo(map);

  // ADEP — green
  L.circleMarker([${depPt.latDeg}, ${depPt.lonDeg}], {
    radius: 10, fillColor: '${T.primary}', color: '${T.bg}', fillOpacity: 1, weight: 2
  }).bindTooltip('${adep}', { permanent: true, direction: 'top', offset: [0, -10],
    className: 'label' }).addTo(map);

  // ADES — red
  L.circleMarker([${arrPt.latDeg}, ${arrPt.lonDeg}], {
    radius: 10, fillColor: '${T.red}', color: '${T.bg}', fillOpacity: 1, weight: 2
  }).bindTooltip('${ades}', { permanent: true, direction: 'top', offset: [0, -10],
    className: 'label' }).addTo(map);

  // Intermediate waypoints — amber
  ${intermediates.map(pt => `
  L.circleMarker([${pt.latDeg}, ${pt.lonDeg}], {
    radius: 5, fillColor: '${T.amber}', color: '${T.bg}', fillOpacity: 0.9, weight: 1
  }).bindTooltip('${pt.identifier}', { direction: 'top', offset: [0, -5] }).addTo(map);
  `).join('')}

  map.fitBounds(latlngs, { padding: [20, 20] });
</script>
</body></html>`
}

export function RouteMapWebView({ flightPlanId, adep, ades, height = 250 }: Props) {
  const [points, setPoints] = useState<RoutePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchRouteGeometry(flightPlanId)
      .then(data => setPoints(data.points ?? []))
      .catch(() => setError('Failed to load route'))
      .finally(() => setLoading(false))
  }, [flightPlanId])

  if (loading) {
    return (
      <View style={[styles.container, { height }]}>
        <ActivityIndicator size="small" color={T.primary} />
      </View>
    )
  }

  if (error || points.length === 0) {
    return (
      <View style={[styles.container, { height: 40 }]}>
        <Text style={styles.errorText}>{error ?? 'No route geometry available'}</Text>
      </View>
    )
  }

  const html = buildMapHtml(points, adep, ades)

  return (
    <View style={[styles.mapWrapper, { height }]}>
      <View style={styles.mapLabel}>
        <Text style={styles.mapLabelText}>ROUTE MAP</Text>
      </View>
      <WebView
        source={{ html }}
        style={styles.webview}
        scrollEnabled={false}
        javaScriptEnabled
        originWhitelist={['*']}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: T.surface,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: T.border,
  },
  mapWrapper: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.border,
    overflow: 'hidden',
    backgroundColor: T.bg,
  },
  mapLabel: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: T.surface,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  mapLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: T.primary,
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: T.bg,
  },
  errorText: {
    fontSize: 12,
    color: T.muted,
  },
})
