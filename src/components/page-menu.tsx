import { type PageId, pages } from "../pages/index.ts";

type PageMenuProps = {
  activePage: PageId;
  onClose: () => void;
  onSelectPage: (pageId: PageId) => void;
};

export const PageMenu = ({ activePage, onClose, onSelectPage }: PageMenuProps) => {
  return (
    <div
      aria-labelledby="page-menu-title"
      aria-modal="true"
      className="menu-overlay"
      role="dialog"
    >
      <button
        aria-label="Close page menu"
        className="menu-backdrop"
        onClick={onClose}
        type="button"
      />

      <aside className="menu-panel">
        <div className="menu-panel__header">
          <div>
            <p className="menu-eyebrow">Pages</p>
            <h2 className="menu-title" id="page-menu-title">
              Choose a workspace
            </h2>
          </div>

          <button className="menu-close" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <p className="menu-description">
          Pick a scene and drop into it. The coin flip and dice room each run as their own full-screen workspace.
        </p>

        <nav aria-label="Available pages" className="menu-pages">
          {pages.map((page) => {
            const isActive = page.id === activePage;

            return (
              <button
                className={`menu-page${isActive ? " menu-page--active" : ""}`}
                key={page.id}
                onClick={() => onSelectPage(page.id)}
                type="button"
              >
                <span className="menu-page__name">{page.label}</span>
                <span className="menu-page__meta">{isActive ? "Current page" : page.description}</span>
              </button>
            );
          })}
        </nav>
      </aside>
    </div>
  );
};
