import Link from 'next/link'
import { FC } from 'react'
import { connectStateResults, Hits, Index } from 'react-instantsearch-dom'

interface SearchResultProps {
  indices: any[]
  className?: string
  show: string | boolean | undefined
}

const HitCount = connectStateResults(({ searchState, searchResults }) => {
  const validQuery = searchState?.query?.length || 0 >= 3
  const hitCount =
    searchResults?.hits.length && validQuery && searchResults.nbHits

  return validQuery ? (
    <div className="float-right flex">
      <div className="text-small py-2 dark:text-white">
        {hitCount} result{hitCount !== 1 ? `s` : ``}
      </div>
    </div>
  ) : null
})

// @ts-ignore
const PageHit = connectStateResults(({ searchState, searchResults, hit }) => {
  const validQuery = searchState?.query?.length || 0 >= 3
  const hitCount =
    searchResults?.hits.length && validQuery && searchResults.nbHits

  return Number(hitCount) > 0 ? (
    <div className="py-1">
      <div className="m-3 grid rounded-md p-3 shadow-md ring-1 ring-slate-200 transition hover:shadow-xl hover:ring-teal-500 dark:hover:ring-1">
        <Link href={hit.pathname}>
          <h2 className="text-base font-semibold text-zinc-800 hover:text-teal-500 dark:text-zinc-100 dark:hover:text-teal-500">
            {hit.title}
          </h2>
          <div className="mx-2 p-2">
            <p className="text-base text-zinc-600 dark:text-zinc-400">
              {hit.description}
            </p>
          </div>
          {/* <div className="text">Published {hit.context?.article?.date}</div> */}
          {/* <img src={hit.context?.article?.hero?.narrow?.src}></img> */}
        </Link>
      </div>
    </div>
  ) : null
})

const HitsInIndex: FC<{ index: any }> = ({ index }) => {
  return (
    <>
      <HitCount />
      <div className="max-h-[calc(100vh-20rem)] w-full overflow-scroll">
        <Index indexName={index.name}>
          {/* @ts-ignore */}
          <Hits className="Hits" hitComponent={PageHit} />
        </Index>
      </div>
    </>
  )
}

const SearchResult: FC<SearchResultProps> = ({ indices, className }) => (
  <div className={className}>
    {indices.map((index) => (
      <HitsInIndex index={index} key={index.name} />
    ))}
  </div>
)

export default SearchResult
