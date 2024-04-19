import { connectSearchBox } from "react-instantsearch-dom";
import { SearchFilterInput } from "./SearchFilterInput";

interface SearchBoxProps {
  refine: any;
}

function SearchBox({ refine }: SearchBoxProps): JSX.Element {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    refine(e.currentTarget.value);
  };

  return (
    <>
      <SearchFilterInput
        id="algolia_search"
        type="search"
        placeholder="Find anything!"
        onChange={handleChange}
      />
    </>
  );
}

export default connectSearchBox(SearchBox);
