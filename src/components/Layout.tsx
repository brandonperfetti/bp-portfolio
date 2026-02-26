import { FooterWithNavigation } from '@/components/Footer'
import { Header } from '@/components/Header'
import { getCmsNavigation } from '@/lib/cms/navigationRepo'

export async function Layout({ children }: { children: React.ReactNode }) {
  const navigationItems = (await getCmsNavigation()).filter(
    (item) => item.showInNav,
  )

  return (
    <>
      <div className="fixed inset-0 flex justify-center sm:px-8">
        <div className="flex w-full max-w-7xl lg:px-8">
          <div className="w-full bg-white ring-1 ring-zinc-100 dark:bg-zinc-900 dark:ring-zinc-300/20" />
        </div>
      </div>
      <div className="relative flex w-full flex-col">
        <Header navigationItems={navigationItems} />
        <main className="flex-auto">{children}</main>
        <FooterWithNavigation navigationItems={navigationItems} />
      </div>
    </>
  )
}
