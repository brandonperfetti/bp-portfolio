import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { Modal } from "./Modal";
import Search from "./Search";
import { useKeyShortcut } from "./useKeyShortcut";

export function HeaderJumper() {
  const [showModal, setShowModal] = useState(false);

  useKeyShortcut(() => setShowModal(true));
  const searchIndices = [
    {
      name: `${process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME}`,
      title: process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME,
    },
  ];

  return (
    <button
      className="group rounded-full bg-white/90 px-3 py-2 shadow-lg shadow-zinc-800/5 ring-1 ring-zinc-900/5 backdrop-blur transition hover:cursor-pointer dark:bg-zinc-800/90 dark:ring-white/10 dark:hover:ring-white/20"
      onClick={() => setShowModal(true)}
    >
      <div className="flex">
        <span className="sr-only">Search</span>
        <MagnifyingGlassIcon className="h-5 w-5 align-middle text-zinc-400" />
        <span className="text-md -mt-0.5 ml-auto hidden flex-none pl-1 align-middle font-semibold text-zinc-400 md:block">
          ⌘K
        </span>
      </div>

      <Modal
        size="md"
        isTop
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        hideClose
      >
        <div className="-m-2">
          <Search indices={searchIndices} />
        </div>
      </Modal>
    </button>
  );
}
