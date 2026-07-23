import { Resume } from '@/components/home/Resume'

/**
 * Work-history section (CMS page builder): the home Work card, backed by
 * the work-history collection. Server component.
 */
export function WorkHistoryCardComponent() {
  return (
    <section className="my-12 max-w-xl">
      <Resume />
    </section>
  )
}
