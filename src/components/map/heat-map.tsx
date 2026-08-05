"use client"

// MARES — Heatmap geográfico dos encalhes (Fase 5). Camada de calor (leaflet.heat) sobre
// o mapa base. Componente puramente client (usa `window`) — montado via dynamic({ ssr:false }).

import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet.heat"
import "leaflet/dist/leaflet.css"

import { useHasSize } from "./use-has-size"

type Props = {
  // Pontos de encalhe: [lat, lon].
  points: [number, number][]
}

export default function HeatMap({ points }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const heatRef = useRef<L.HeatLayer | null>(null)
  const hasSize = useHasSize(containerRef)

  useEffect(() => {
    if (!hasSize || !containerRef.current || mapRef.current) return
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
  }, [hasSize])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !hasSize) return
    if (heatRef.current) {
      map.removeLayer(heatRef.current)
      heatRef.current = null
    }
    if (points.length === 0) return
    const heatPoints = points.map(([lat, lon]) => [lat, lon, 1] as L.HeatLatLngTuple)
    // `maxZoom` baixo é essencial: o leaflet.heat escala a intensidade por
    // 1/2^(maxZoom−zoom), então um valor alto some com a mancha nos zooms
    // nacionais. Com maxZoom 3 a intensidade fica cheia em qualquer zoom ≥ 3.
    // `minOpacity` garante que até um encalhe isolado apareça; `max` faz as
    // concentrações escurecerem para o vermelho conforme os pontos se sobrepõem.
    const heat = L.heatLayer(heatPoints, {
      radius: 28,
      blur: 20,
      minOpacity: 0.4,
      maxZoom: 3,
      max: 4,
    })
    heat.addTo(map)
    heatRef.current = heat
    const bounds = L.latLngBounds(points as L.LatLngTuple[])
    map.fitBounds(bounds.pad(0.2), { maxZoom: 11 })
  }, [points, hasSize])

  return <div ref={containerRef} className="h-full w-full" />
}
