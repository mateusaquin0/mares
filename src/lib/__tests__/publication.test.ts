import { describe, expect, it } from "vitest"

import { publicationStatus } from "../publication"

describe("publicationStatus", () => {
  it("publica só com o animal marcado e a pesquisa pública", () => {
    expect(publicationStatus(true, true)).toBe("published")
  })

  it("pesquisa privada nunca publica, mesmo com o animal marcado", () => {
    expect(publicationStatus(true, false)).toBe("researchPrivate")
    expect(publicationStatus(false, false)).toBe("researchPrivate")
  })

  it("pesquisa pública com o animal desmarcado fica retido pelo grupo", () => {
    expect(publicationStatus(false, true)).toBe("withheld")
  })
})
