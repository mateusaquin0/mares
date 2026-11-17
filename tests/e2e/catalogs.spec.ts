import { type Page } from "@playwright/test"

import { as, expect, test } from "./helpers/test"

import {
  combobox,
  confirmAlert,
  expectToast,
  hydrated,
  pickFromSelect,
  pt,
  rowMenu,
} from "./helpers/app"
import { AUTH_ENABLED, AUTH_SKIP_REASON, loadFixtures, storageStatePath } from "./helpers/fixtures"

// Glossário (materiais, patógenos, tipos de exame, sistemas). O admin de grupo adiciona itens
// direto; a pesquisadora só solicita, e a curadoria (admin de grupo) aprova ou rejeita.
//
// Todo item criado aqui tem o nome começando no prefixo da execução: a chave do item é derivada
// do nome, e é por ela que o teardown o remove. O NCBI nunca é consultado: a suíte responde no
// lugar de /api/ncbi.

const c = pt.catalogs
const cr = pt.catalogRequests

async function openGlossary(page: Page, tab?: string) {
  await page.goto("/app/catalogs")
  const organs = page.getByRole("tab", { name: c.tabOrgans })
  await hydrated(organs)
  if (tab) await page.getByRole("tab", { name: tab }).click()
}

async function search(page: Page, text: string) {
  await page.getByPlaceholder(pt.common.search, { exact: true }).fill(text)
}

// Preenche e envia o formulário de item com nome em português e inglês.
async function submitNamed(
  page: Page,
  title: string,
  namePt: string,
  nameEn: string,
  action: string,
) {
  const dialog = page.getByRole("dialog", { name: title })
  await dialog.getByLabel(c.namePt).fill(namePt)
  await dialog.getByLabel(c.nameEn).fill(nameEn)
  await dialog.getByRole("button", { name: action, exact: true }).click()
}

test.describe("Glossário — admin do grupo", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)
  test.use({ storageState: storageStatePath("workAdmin") })

  test("lista e busca; adiciona, edita e remove um material biológico", async ({ page }) => {
    const { prefix, catalog } = loadFixtures()
    const namePt = `${prefix} Baço`
    const nameEn = `${prefix} Spleen`

    await openGlossary(page)
    await search(page, prefix)
    await expect(page.getByRole("row").filter({ hasText: catalog.organ.label })).toBeVisible()
    await expect(page.getByRole("row").filter({ hasText: catalog.organ2.label })).toBeVisible()
    await search(page, `${prefix} não existe`)
    await expect(page.getByText(pt.common.noResults)).toBeVisible()

    // Um item que não foi cadastrado por quem está logado só aceita sugestão de edição.
    await search(page, catalog.organ.label)
    await page
      .getByRole("row")
      .filter({ hasText: catalog.organ.label })
      .getByRole("button", { name: pt.common.actions })
      .click()
    await expect(page.getByRole("menuitem", { name: c.suggestEdit })).toBeVisible()
    await expect(page.getByRole("menuitem", { name: pt.common.delete })).toHaveCount(0)
    await page.keyboard.press("Escape")

    // Adicionar: os dois nomes são obrigatórios.
    await page.getByRole("button", { name: c.add, exact: true }).click()
    const dialog = page.getByRole("dialog", { name: c.addTitle })
    await dialog.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expect(dialog.getByText(pt.validation.required)).toHaveCount(2)
    await submitNamed(page, c.addTitle, namePt, nameEn, pt.common.save)
    await expectToast(page, c.created)
    await expect(dialog).toBeHidden()

    await search(page, namePt)
    const row = page.getByRole("row").filter({ hasText: namePt })
    await expect(row).toContainText(nameEn)

    // Nome repetido é recusado.
    await page.getByRole("button", { name: c.add, exact: true }).click()
    await submitNamed(page, c.addTitle, namePt, nameEn, pt.common.save)
    await expectToast(page, c.createError)
    await dialog.getByRole("button", { name: pt.common.cancel }).click()

    // Quem cadastrou pode editar e remover enquanto o item não está em uso.
    await rowMenu(page, row, pt.common.edit)
    const edit = page.getByRole("dialog", { name: c.editTitle })
    await expect(edit.getByLabel(c.namePt)).toHaveValue(namePt)
    await edit.getByLabel(c.nameEn).fill(`${nameEn} (edited)`)
    await edit.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expectToast(page, c.updated)
    await expect(row).toContainText(`${nameEn} (edited)`)

    await page.reload()
    await search(page, namePt)
    await expect(row).toContainText(`${nameEn} (edited)`)

    await rowMenu(page, row, pt.common.delete)
    await expect(page.getByRole("alertdialog", { name: c.deleteTitle })).toContainText(namePt)
    await confirmAlert(page, c.deleteTitle, pt.common.delete)
    await expectToast(page, c.deleted)
    await expect(row).toHaveCount(0)
  })

  test("adiciona tipo de exame com medida quantitativa e sistema anatômico", async ({ page }) => {
    const { prefix } = loadFixtures()
    const exam = `${prefix} Sorologia`
    const system = `${prefix} Sistema nervoso`

    await openGlossary(page, c.tabExamTypes)
    await page.getByRole("button", { name: c.add, exact: true }).click()
    const dialog = page.getByRole("dialog", { name: c.addTitle })
    await dialog.getByLabel(c.namePt).fill(exam)
    await dialog.getByLabel(c.nameEn).fill(`${prefix} Serology`)
    // Os campos da medida só existem depois de marcar que o exame tem leitura quantitativa.
    await expect(dialog.getByLabel(c.measurePt)).toHaveCount(0)
    await dialog.getByRole("checkbox", { name: c.hasMeasure }).check()
    await dialog.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expect(dialog.getByText(pt.validation.required)).toHaveCount(2)
    await dialog.getByLabel(c.measurePt).fill("Título")
    await dialog.getByLabel(c.measureEn).fill("Titer")
    await dialog.getByLabel(c.measureUnit).fill("1:")
    await dialog.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expectToast(page, c.created)

    await search(page, exam)
    const examRow = page.getByRole("row").filter({ hasText: exam })
    await expect(examRow).toContainText(`${prefix} Serology`)
    // A medida ficou gravada: o formulário de edição a traz de volta.
    await rowMenu(page, examRow, pt.common.edit)
    const edit = page.getByRole("dialog", { name: c.editTitle })
    await expect(edit.getByRole("checkbox", { name: c.hasMeasure })).toBeChecked()
    await expect(edit.getByLabel(c.measurePt)).toHaveValue("Título")
    await expect(edit.getByLabel(c.measureUnit)).toHaveValue("1:")
    await edit.getByRole("button", { name: pt.common.cancel }).click()

    await page.getByRole("tab", { name: c.tabSystems }).click()
    await page.getByRole("button", { name: c.add, exact: true }).click()
    await submitNamed(page, c.addTitle, system, `${prefix} Nervous system`, pt.common.save)
    await expectToast(page, c.created)
    await search(page, system)
    await expect(page.getByRole("row").filter({ hasText: system })).toContainText(
      `${prefix} Nervous system`,
    )
  })

  test("patógenos: grupo de nome comum por nome; grupo científico só pela sugestão do NCBI", async ({
    page,
  }) => {
    const { prefix, runId } = loadFixtures()
    const common = `${prefix} Rede de pesca`
    const scientific = `E2e ${runId} bacterium`
    const searched: string[] = []
    await page.route("**/api/ncbi?*", (route) => {
      searched.push(new URL(route.request().url()).searchParams.get("q") ?? "")
      return route.fulfill({
        json: [
          {
            key: 990000001,
            scientificName: scientific,
            rank: "species",
            family: "Etwoefamiliaceae",
            order: "Etwoeordinales",
          },
        ],
      })
    })

    await openGlossary(page, c.tabPathogens)
    await page.getByRole("button", { name: c.add, exact: true }).click()
    const dialog = page.getByRole("dialog", { name: c.addTitle })
    const group = () => dialog.getByRole("combobox").first()

    // Sem grupo não salva.
    await dialog.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expect(dialog.getByText(pt.validation.required).first()).toBeVisible()

    // Grupo que não usa nome científico: os campos são os nomes em português e inglês.
    await pickFromSelect(page, group(), "Ações antrópicas")
    await expect(dialog.getByLabel(c.nameSci)).toHaveCount(0)
    await dialog.getByLabel(c.namePt).fill(common)
    await dialog.getByLabel(c.nameEn).fill(`${prefix} Fishing net`)
    await dialog.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expectToast(page, c.created)
    await search(page, common)
    await expect(page.getByRole("row").filter({ hasText: common })).toContainText(
      "Ações antrópicas",
    )

    // Grupo científico: nome digitado livremente é recusado…
    await page.getByRole("button", { name: c.add, exact: true }).click()
    await pickFromSelect(page, group(), "Bactérias")
    const sci = dialog.getByLabel(c.nameSci)
    await sci.fill("E2e inventado")
    await expect(page.getByRole("button", { name: scientific })).toBeVisible()
    // (a lista de sugestões cobre o rodapé do diálogo: um clique fora dela a fecha)
    await dialog.getByText(c.addDescPathogen).click()
    await dialog.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expect(dialog.getByText(c.ncbiRequired)).toBeVisible()

    // …e a sugestão do NCBI vincula o táxon.
    await sci.fill("E2e")
    await page.getByRole("button", { name: scientific }).click()
    await expect(sci).toHaveValue(scientific)
    await expect(dialog.getByText(/Vinculado ao NCBI \(taxID 990000001\)/)).toBeVisible()
    await dialog.getByRole("button", { name: pt.common.save, exact: true }).click()
    await expectToast(page, c.created)
    expect(searched).toContain("E2e")

    await search(page, scientific)
    await expect(page.getByRole("row").filter({ hasText: scientific })).toContainText("Bactérias")
  })
})

test.describe("Glossário — solicitação e curadoria", () => {
  test.skip(!AUTH_ENABLED, AUTH_SKIP_REASON)

  test("a pesquisadora solicita dois itens; a curadoria aprova um e rejeita o outro", async ({
    browser,
  }) => {
    const { prefix, orgs } = loadFixtures()
    const organ = `${prefix} Rim solicitado`
    const system = `${prefix} Sistema recusado`
    const researcher = await as(browser, "workResearcher")
    const admin = await as(browser, "workAdmin")

    // A pesquisadora não adiciona direto: o botão vira "Solicitar item".
    await openGlossary(researcher)
    await expect(researcher.getByRole("button", { name: c.add, exact: true })).toHaveCount(0)
    await researcher.getByRole("button", { name: c.request }).click()
    await submitNamed(
      researcher,
      c.requestTitle,
      organ,
      `${prefix} Requested kidney`,
      c.sendRequest,
    )
    await expectToast(researcher, c.requestSent)
    // Solicitar não cria o item.
    await search(researcher, organ)
    await expect(researcher.getByText(pt.common.noResults)).toBeVisible()

    await researcher.getByRole("tab", { name: c.tabSystems }).click()
    await researcher.getByRole("button", { name: c.request }).click()
    await submitNamed(researcher, c.requestTitle, system, `${prefix} Refused system`, c.sendRequest)
    await expect(
      researcher.locator("[data-sonner-toast]").filter({ hasText: c.requestSent }),
    ).toHaveCount(2)

    // "Minhas solicitações": as duas pendentes.
    await researcher.getByRole("link", { name: c.myRequests }).click()
    await expect(researcher.getByRole("heading", { name: cr.mineTitle, level: 1 })).toBeVisible()
    const mine = (item: string) => researcher.getByRole("row").filter({ hasText: item })
    await expect(mine(organ)).toContainText(cr.type_ORGAN)
    await expect(mine(organ)).toContainText(cr.status_PENDING)
    await expect(mine(system)).toContainText(cr.type_SYSTEM)
    await expect(mine(system)).toContainText(cr.status_PENDING)

    // Curadoria: a fila mostra de que grupo veio, sem expor o e-mail a quem não é admin global.
    await openGlossary(admin)
    await admin.getByRole("link", { name: c.reviewQueue }).click()
    await expect(admin.getByRole("heading", { name: cr.title, level: 1 })).toBeVisible()
    const queued = (item: string) => admin.getByRole("row").filter({ hasText: item })
    await expect(queued(organ)).toContainText(`Pesquisador do grupo ${orgs.work.name}`)

    await queued(organ).click()
    const detail = admin.getByRole("dialog", { name: organ })
    await expect(detail).toContainText(`${prefix} Requested kidney`)
    await detail.getByRole("button", { name: cr.approve }).click()
    await expectToast(admin, cr.approved)
    await expect(queued(organ)).toHaveCount(0)

    await queued(system).click()
    const refuse = admin.getByRole("dialog", { name: system })
    await refuse.getByRole("button", { name: cr.reject, exact: true }).click()
    await refuse.getByPlaceholder(cr.rejectNotePlaceholder).fill("Já existe como sistema nervoso.")
    await refuse.getByRole("button", { name: cr.confirmReject }).click()
    await expectToast(admin, cr.rejected)
    await expect(queued(system)).toHaveCount(0)

    // As abas de histórico da curadoria.
    await admin.getByRole("tab", { name: cr.status_APPROVED }).click()
    await expect(queued(organ)).toBeVisible()
    await admin.getByRole("tab", { name: cr.status_REJECTED }).click()
    await expect(queued(system)).toBeVisible()
    await queued(system).click()
    await expect(admin.getByRole("dialog", { name: system })).toContainText(
      "Já existe como sistema nervoso.",
    )

    // O item aprovado entrou no glossário; o rejeitado não.
    await openGlossary(admin)
    await search(admin, organ)
    await expect(admin.getByRole("row").filter({ hasText: organ })).toContainText(
      `${prefix} Requested kidney`,
    )
    await admin.getByRole("tab", { name: c.tabSystems }).click()
    await search(admin, system)
    await expect(admin.getByText(pt.common.noResults)).toBeVisible()

    // A pesquisadora acompanha o desfecho, com o motivo da rejeição.
    await researcher.reload()
    await expect(mine(organ)).toContainText(cr.status_APPROVED)
    await expect(mine(organ)).toContainText(cr.approvedNote)
    await expect(mine(system)).toContainText(cr.status_REJECTED)
    await expect(mine(system)).toContainText("Já existe como sistema nervoso.")

    // …e o material aprovado já pode ser escolhido num protocolo.
    await researcher.goto(`/app/research/${loadFixtures().work.sharing.origin.id}`)
    const organPicker = combobox(researcher, pt.protocol.organ)
    await hydrated(organPicker)
    await organPicker.click()
    await researcher.getByPlaceholder(pt.common.search, { exact: true }).fill(organ)
    await expect(researcher.getByRole("option", { name: organ, exact: true })).toBeVisible()

    await researcher.context().close()
    await admin.context().close()
  })
})
