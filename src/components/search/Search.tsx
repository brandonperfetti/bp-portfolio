import algoliasearch from 'algoliasearch/lite'
import { createRef, useState } from 'react'
import { InstantSearch } from 'react-instantsearch-dom'
import SearchBox from './SearchBox'
import SearchResult from './SearchResult'
import { useClickOutside } from '@/hooks'

const searchClient = algoliasearch(
  process.env.NEXT_PUBLIC_ALGOLIA_APP_ID ?? '',
  process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY ?? '',
)

interface SearchProps {
  indices: { name: string }[]
}

function Search({ indices }: SearchProps) {
  const rootRef = createRef<HTMLDivElement>()
  const [query, setQuery] = useState<string | undefined>()
  const [hasFocus, setFocus] = useState<boolean>(false)
  useClickOutside(rootRef, () => setFocus(false))
  return (
    <>
      <InstantSearch
        searchClient={searchClient} // this is the Algolia client
        indexName={indices[0].name}
        onSearchStateChange={({ query }) => setQuery(query)}
      >
        <SearchBox />
        {query && query.length > 0 && (
          <SearchResult
            show={query && query.length > 0 && hasFocus}
            indices={indices}
          />
        )}
      </InstantSearch>
    </>
  )
}

export default Search
