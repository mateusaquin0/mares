import { getTranslations } from "next-intl/server"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SignOutButton } from "@/components/layout/sign-out-button"

export default async function NoOrganizationPage() {
  const t = await getTranslations("noOrg")
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutButton />
        </CardContent>
      </Card>
    </div>
  )
}
