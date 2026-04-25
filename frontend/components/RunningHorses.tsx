"use client";

function RunningHorses() {
  return (
    <div className="rh-group">
      {/* Horse 1 — leading, largest */}
      <svg className="rh-horse rh-h1" viewBox="0 0 60 40" fill="none">
        <g stroke="#1d4ed8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          {/* body */}
          <path d="M18 18 Q30 14 42 16 Q48 17 52 20" />
          <path d="M18 18 Q20 26 22 30 Q24 33 28 34" />
          {/* neck & head */}
          <path d="M52 20 Q54 16 56 13" />
          <path d="M56 13 Q58 11 59 13 Q58 15 56 16" />
          {/* ear */}
          <path d="M56 13 Q55 10 54 11" />
          {/* front legs */}
          <path d="M46 22 Q48 28 50 34 Q51 37 52 38" />
          <path d="M42 24 Q40 30 38 35 Q37 37 36 38" />
          {/* hind legs */}
          <path d="M24 32 Q22 36 20 38" />
          <path d="M28 34 Q30 36 28 38" />
          {/* tail */}
          <path d="M18 18 Q14 15 10 12 Q8 10 6 11" className="rh-tail" />
          {/* mane */}
          <path d="M52 20 Q50 18 48 19 Q46 17 44 18" className="rh-mane" />
        </g>
      </svg>

      {/* Horse 2 — middle */}
      <svg className="rh-horse rh-h2" viewBox="0 0 60 40" fill="none">
        <g stroke="#3b6cf5" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 18 Q30 14 42 16 Q48 17 52 20" />
          <path d="M18 18 Q20 26 22 30 Q24 33 28 34" />
          <path d="M52 20 Q54 16 56 13" />
          <path d="M56 13 Q58 11 59 13 Q58 15 56 16" />
          <path d="M56 13 Q55 10 54 11" />
          <path d="M46 22 Q48 28 50 34 Q51 37 52 38" />
          <path d="M42 24 Q40 30 38 35 Q37 37 36 38" />
          <path d="M24 32 Q22 36 20 38" />
          <path d="M28 34 Q30 36 28 38" />
          <path d="M18 18 Q14 15 10 12 Q8 10 6 11" className="rh-tail" />
          <path d="M52 20 Q50 18 48 19 Q46 17 44 18" className="rh-mane" />
        </g>
      </svg>

      {/* Horse 3 — trailing, smallest */}
      <svg className="rh-horse rh-h3" viewBox="0 0 60 40" fill="none">
        <g stroke="#6ba3ff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 18 Q30 14 42 16 Q48 17 52 20" />
          <path d="M18 18 Q20 26 22 30 Q24 33 28 34" />
          <path d="M52 20 Q54 16 56 13" />
          <path d="M56 13 Q58 11 59 13 Q58 15 56 16" />
          <path d="M56 13 Q55 10 54 11" />
          <path d="M46 22 Q48 28 50 34 Q51 37 52 38" />
          <path d="M42 24 Q40 30 38 35 Q37 37 36 38" />
          <path d="M24 32 Q22 36 20 38" />
          <path d="M28 34 Q30 36 28 38" />
          <path d="M18 18 Q14 15 10 12 Q8 10 6 11" className="rh-tail" />
          <path d="M52 20 Q50 18 48 19 Q46 17 44 18" className="rh-mane" />
        </g>
      </svg>

      {/* Horse 4 — tiny, distant */}
      <svg className="rh-horse rh-h4" viewBox="0 0 60 40" fill="none">
        <g stroke="#93b8ff" strokeWidth="1.0" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 18 Q30 14 42 16 Q48 17 52 20" />
          <path d="M18 18 Q20 26 22 30 Q24 33 28 34" />
          <path d="M52 20 Q54 16 56 13" />
          <path d="M56 13 Q58 11 59 13" />
          <path d="M46 22 Q48 28 50 34" />
          <path d="M24 32 Q22 36 20 38" />
          <path d="M18 18 Q14 15 10 12" className="rh-tail" />
        </g>
      </svg>

      {/* Speed lines */}
      <div className="rh-lines">
        <span className="rh-line rh-line-1" />
        <span className="rh-line rh-line-2" />
        <span className="rh-line rh-line-3" />
      </div>
    </div>
  );
}

export default RunningHorses;