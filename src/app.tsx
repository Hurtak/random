import { useEffect, useState } from "react";

import "./app.css";
import { PageMenu } from "./components/page-menu.tsx";
import { pageComponents, type PageId } from "./pages/index.ts";

export const App = () => {
  const [activePage, setActivePage] = useState<PageId>("coin");
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    globalThis.addEventListener("keydown", handleKeyDown);

    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const ActivePage = pageComponents[activePage];

  const handlePageSelect = (pageId: PageId) => {
    setActivePage(pageId);
    setIsMenuOpen(false);
  };

  return (
    <div className="app-shell">
      <ActivePage />

      <button
        aria-expanded={isMenuOpen}
        aria-haspopup="dialog"
        aria-label="Open page menu"
        className="menu-toggle"
        onClick={() => setIsMenuOpen(true)}
        type="button"
      >
        <span />
        <span />
        <span />
      </button>

      {isMenuOpen && (
        <PageMenu
          activePage={activePage}
          onClose={() => setIsMenuOpen(false)}
          onSelectPage={handlePageSelect}
        />
      )}
    </div>
  );
};
