import clsx from 'clsx'

export default function Prose({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={clsx(className, 'prose dark:prose-invert')} {...props} />
  )
}
