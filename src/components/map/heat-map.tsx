"use client"

// MARES — Heatmap geográfico dos encalhes (Fase 5). Camada de calor (leaflet.heat) sobre
// o mapa base. Componente puramente client (usa `window`) — montado via dynamic({ ssr:false }).

import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet.heat"
import "leaflet/dist/leaflet.css"

type Props = {
  // Pontos de encalhe: [lat, lon].
  points: [number, number][]
}

export default function HeatMap({ points }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const heatRef = useRef<L.HeatLayer | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { center: [-15, -47], zoom: 4, scrollWheelZoom: true })
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      heatRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (heatRef.current) {
      map.removeLayer(heatRef.current)
      heatRef.current = null
    }
    if (points.length === 0) return
    const heatPoints = points.map(([lat, lon]) => [lat, lon, 0.6] as L.HeatLatLngTuple)
    const heat = L.heatLayer(heatPoints, {
      radius: 25,
      blur: 18,
      maxZoom: 12,
    })
    heat.addTo(map)
    heatRef.current = heat
    const bounds = L.latLngBounds(points as L.LatLngTuple[])
    map.fitBounds(bounds.pad(0.2), { maxZoom: 11 })
  }, [points])

  return <div ref={containerRef} className="h-full w-full" />
}
