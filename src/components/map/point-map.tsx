"use client"

// MARES — Mapa de ponto único (detalhe do animal). Mostra a coordenada de encalhe
// com um único pin. Componente puramente client (usa `window`) — montado via
// dynamic({ ssr: false }).

import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

import { useHasSize } from "./use-has-size"

type Props = {
  lat: number
  lon: number
  // Rótulo opcional exibido no popup do pin (ex.: praia / município).
  label?: string
  zoom?: number
}

const NAVY = "#003366"

// Pin SVG como divIcon — evita depender dos PNGs padrão do Leaflet (quebram no bundler).
function pinIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="36" viewBox="0 0 26 36">
    <path d="M13 0C5.8 0 0 5.8 0 13c0 9.6 13 23 13 23s13-13.4 13-23C26 5.8 20.2 0 13 0z" fill="${NAVY}"/>
    <circle cx="13" cy="13" r="5" fill="#fff"/>
  </svg>`
  return L.divIcon({
    html: svg,
    className: "mares-pin",
    iconSize: [26, 36],
    iconAnchor: [13, 36],
    popupAnchor: [0, -32],
  })
}

export default function PointMap({ lat, lon, label, zoom = 11 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const hasSize = useHasSize(containerRef)

  useEffect(() => {
    if (!hasSize || !containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { center: [lat, lon], zoom, scrollWheelZoom: false })
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)
    const marker = L.marker([lat, lon], { icon: pinIcon() }).addTo(map)
    if (label) marker.bindPopup(label)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [lat, lon, label, zoom, hasSize])

  return <div ref={containerRef} className="h-full w-full" />
}
