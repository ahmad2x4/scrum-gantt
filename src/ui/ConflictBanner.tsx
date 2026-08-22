import type { ConflictChoice } from "./saveController";

export interface ConflictBannerProps {
  onChoose(choice: ConflictChoice): void;
}

export function ConflictBanner({ onChoose }: ConflictBannerProps) {
  return (
    <div className="banner banner-conflict" role="alert">
      <span>This plan was changed elsewhere since you opened it.</span>
      <button onClick={() => onChoose("reload")}>Reload theirs</button>
      <button onClick={() => onChoose("copy")}>Save as a copy</button>
      <button onClick={() => onChoose("overwrite")}>Overwrite</button>
    </div>
  );
}
