"use client"

// MARES — Mapa Leaflet dos encalhes (Fase 4). Componente puramente client (usa `window`);
// é sempre montado via import dinâmico com { ssr: false } (ver map-explorer.tsx).
// Renderiza os marcadores com clustering (leaflet.markercluster) e popup por animal.

import { useEffect, useMemo, useRef } from "react"
import L from "leaflet"
import "leaflet.markercluster"
import "leaflet/dist/leaflet.css"
import "leaflet.markercluster/dist/MarkerCluster.css"
import "leaflet.markercluster/dist/MarkerCluster.Default.css"

import type { MapPoint } from "@/lib/map-points"
import { useHasSize } from "./use-has-size"

// Rótulos do popup (traduzidos no MapExplorer e repassados — o Leaflet monta HTML imperativo).
export type PopupLabels = {
  date: string
  location: string
  research: string
  positive: string
  noPositive: string
  viewDetails: string
  hidden: string
  undetermined: string
}

type Props = {
  points: MapPoint[]
  labels: PopupLabels
  // Base de link para o detalhe do animal (mapa privado). Ausente no mapa público.
  linkBase?: string
  locale: string
}

const NAVY = "#003366"
const AMBER = "#B45309" // animais ocultos (mapa privado): destaque de que não são públicos

// Pin SVG como divIcon — evita depender dos PNGs padrão do Leaflet (quebram no bundler).
function pinIcon(color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="36" viewBox="0 0 26 36">
    <path d="M13 0C5.8 0 0 5.8 0 13c0 9.6 13 23 13 23s13-13.4 13-23C26 5.8 20.2 0 13 0z" fill="${color}"/>
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

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  )
}

function popupHtml(p: MapPoint, labels: PopupLabels, locale: string, linkBase?: string): string {
  const title = esc(p.controlId || p.species || labels.undetermined)
  const species = p.species
    ? `<div style="font-style:italic;color:#475569;font-size:12px;margin-top:1px">${esc(p.species)}</div>`
    : ""
  const location = [p.municipality, p.state].filter(Boolean).join(", ")
  const date = p.eventDate
    ? new Intl.DateTimeFormat(locale, {
        timeZone: "UTC", // eventDate é data-só-data (meia-noite UTC); UTC preserva o dia
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(p.eventDate))
    : "—"
  const rows: string[] = []
  rows.push(`<div><span style="color:#64748b">${esc(labels.date)}:</span> ${esc(date)}</div>`)
  if (location)
    rows.push(
      `<div><span style="color:#64748b">${esc(labels.location)}:</span> ${esc(location)}</div>`,
    )
  if (p.researchName)
    rows.push(
      `<div><span style="color:#64748b">${esc(labels.research)}:</span> ${esc(p.researchName)}</div>`,
    )
  const positives = p.positivePathogens.length
    ? `<div style="margin-top:6px"><span style="color:#64748b">${esc(labels.positive)}:</span><br/>${p.positivePathogens
        .map(
          (n) =>
            `<span style="display:inline-block;margin:2px 3px 0 0;padding:1px 6px;border-radius:9999px;background:#fee2e2;color:#991b1b;font-size:11px">${esc(n)}</span>`,
        )
        .join("")}</div>`
    : `<div style="margin-top:6px;color:#64748b">${esc(labels.noPositive)}</div>`
  const hiddenBadge = !p.isPublic
    ? `<span style="margin-left:6px;padding:1px 6px;border-radius:9999px;background:#fef3c7;color:#92400e;font-size:10px;vertical-align:middle">${esc(labels.hidden)}</span>`
    : ""
  const link =
    linkBase != null
      ? `<a href="${linkBase}/${encodeURIComponent(p.id)}" style="display:inline-block;margin-top:8px;color:#006876;font-weight:600;font-size:12px;text-decoration:none">${esc(labels.viewDetails)} →</a>`
      : ""
  return `<div style="min-width:190px;font-size:13px;line-height:1.5;color:#0f172a">
    <div style="font-weight:700">${title}${hiddenBadge}</div>
    ${species}
    <div style="margin-top:6px">${rows.join("")}</div>
    ${positives}
    ${link}
  </div>`
}

export default function LeafletMap({ points, labels, linkBase, locale }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null)
  const hasSize = useHasSize(containerRef)

  const iconPublic = useMemo(() => pinIcon(NAVY), [])
  const iconHidden = useMemo(() => pinIcon(AMBER), [])

  // Inicializa o mapa uma única vez.
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
      clusterRef.current = null
    }
  }, [hasSize])

  // (Re)desenha os marcadores quando os pontos mudam (filtros).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !hasSize) return
    if (clusterRef.current) {
      map.removeLayer(clusterRef.current)
      clusterRef.current = null
    }
    const cluster = L.markerClusterGroup({ maxClusterRadius: 50 })
    for (const p of points) {
      const marker = L.marker([p.lat, p.lon], { icon: p.isPublic ? iconPublic : iconHidden })
      marker.bindPopup(popupHtml(p, labels, locale, linkBase))
      cluster.addLayer(marker)
    }
    map.addLayer(cluster)
    clusterRef.current = cluster
    if (points.length > 0) {
      map.fitBounds(cluster.getBounds().pad(0.2), { maxZoom: 12 })
    }
  }, [points, labels, linkBase, locale, iconPublic, iconHidden, hasSize])

  return <div ref={containerRef} className="h-full w-full" />
}
