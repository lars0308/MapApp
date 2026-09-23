export function SpriteStudio({ kind }: { kind: 'character' | 'object'; desktop: boolean }) {
  return <div className="page">{kind}</div>;
}
