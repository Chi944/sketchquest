import { ArrowUpRight, Gem, Snowflake, Trees, Waves } from 'lucide-react';
import { EXPEDITIONS } from '../core/examples';
import { boardHash } from '../core/board';
import type { BoardDefinition } from '../core/types';
import { Board } from './Board';
import s from './ExpeditionTrail.module.css';

const icons = { forest: Trees, coast: Waves, frost: Snowflake };
const worlds = {
  forest: 'The overgrown ruins',
  coast: 'The sunken coast',
  frost: 'The frozen passage',
};
export function ExpeditionTrail({
  board,
  onChoose,
}: {
  board: BoardDefinition;
  onChoose: (expedition: (typeof EXPEDITIONS)[number]) => void;
}) {
  return (
    <section className={s.trail} id="expeditions" aria-labelledby="expedition-heading">
      <div className={s.heading}>
        <div>
          <h2 id="expedition-heading">Beyond the first path.</h2>
          <p>Six expeditions. Three worlds. A few delightful obstacles.</p>
        </div>
        <span>
          <Gem size={17} /> Collect. Discover. Find your way.
        </span>
      </div>
      <div className={s.quests}>
        {EXPEDITIONS.map((quest, index) => {
          const Icon = icons[quest.theme];
          const current = boardHash(board) === boardHash(quest.board);
          return (
            <button
              key={quest.id}
              type="button"
              className={`${s.quest} ${s[quest.theme]}`}
              onClick={() => onChoose(quest)}
              aria-label={`Play expedition: ${quest.title}`}
              aria-pressed={current}
            >
              <div className={s.preview}>
                <span className={s.chapter}>{String(index + 1).padStart(2, '0')}</span>
                <Board board={quest.board} miniature />
                <span className={s.play}>
                  <ArrowUpRight size={23} />
                </span>
              </div>
              <div className={s.details}>
                <div className={s.world}>
                  <Icon size={15} />
                  {worlds[quest.theme]}
                  <span>{current ? 'Playing' : quest.difficulty}</span>
                </div>
                <h3>{quest.title}</h3>
                <p>{quest.description}</p>
                <div className={s.mechanics}>
                  {quest.mechanics.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
