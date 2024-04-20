import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { ChangeEvent, useEffect, useRef } from 'react'
import { Input } from '../common'

interface SearchFilterInputProps {
  id?: string
  type?: string
  value?: string
  placeholder: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
}

const SearchFilterInput = ({
  value,
  placeholder,
  onChange,
}: SearchFilterInputProps) => {
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKeyPress(event: KeyboardEvent) {
      if (
        event.key === '/' &&
        document.activeElement !== searchInputRef.current
      ) {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    document.body.addEventListener('keydown', onKeyPress)
    return () => {
      document.body.removeEventListener('keydown', onKeyPress)
    }
  }, [])

  return (
    <Input
      ref={searchInputRef}
      aria-label="search"
      leftIcon={<MagnifyingGlassIcon />}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
    />
  )
}
export default SearchFilterInput
