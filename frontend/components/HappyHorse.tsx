function HappyHorseIcon() {
  return (
    <div className="hh-wrap">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" className="hh-svg">
        <defs>
          <linearGradient id="mg" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#3a1c71" />
            <stop offset="40%"  stopColor="#6a4c9c" />
            <stop offset="75%"  stopColor="#d76d77" />
            <stop offset="100%" stopColor="#ffaf7b" />
          </linearGradient>
          <linearGradient id="mg2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#ffaf7b" />
            <stop offset="60%"  stopColor="#d76d77" />
            <stop offset="100%" stopColor="#6a4c9c" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Atmospheric background */}
        <path d="M 30 330 Q 300 285 520 330 T 790 285" fill="none" stroke="#d76d77" strokeWidth="28" opacity="0.04"/>
        <path d="M 20 255 Q 260 205 460 255 T 790 205" fill="none" stroke="#6a4c9c" strokeWidth="38" opacity="0.04"/>

        {/* Speed lines - motion effect */}
        <g stroke="url(#mg)" fill="none" strokeLinecap="round">
          <path d="M 22 252 L 192 246" strokeWidth="2" opacity="0.42">
            <animate attributeName="stroke-dasharray" from="0,200" to="200,0" dur="1.5s" begin="2.6s" fill="freeze"/>
          </path>
          <path d="M 8 280 L 168 275" strokeWidth="1.6" opacity="0.35">
            <animate attributeName="stroke-dasharray" from="0,180" to="180,0" dur="1.5s" begin="2.8s" fill="freeze"/>
          </path>
          <path d="M 30 308 L 182 304" strokeWidth="1.8" opacity="0.32">
            <animate attributeName="stroke-dasharray" from="0,165" to="165,0" dur="1.5s" begin="2.7s" fill="freeze"/>
          </path>
          <path d="M 50 336 L 200 332" strokeWidth="1.2" opacity="0.28">
            <animate attributeName="stroke-dasharray" from="0,165" to="165,0" dur="1.5s" begin="2.9s" fill="freeze"/>
          </path>
        </g>

        <g stroke="url(#mg)" fill="none" strokeLinecap="round" strokeLinejoin="round">

          {/* ===== TAIL — three sweeping strands, dramatic uplift ===== */}
          {/* Upper tail strand — sweeps up-left */}
          <path d="M 272 218
                   C 230 195, 178 172, 125 158
                   C 84 146, 46 150, 18 172
                   C 54 162, 96 170, 135 186
                   C 178 204, 225 228, 260 238"
                strokeWidth="2.8">
            <animate attributeName="stroke-dasharray" from="0,640" to="640,0" dur="3.6s" begin="0.2s" fill="freeze"/>
          </path>
          {/* Middle tail strand */}
          <path d="M 268 230
                   C 218 214, 162 204, 108 210
                   C 68 214, 34 238, 14 275
                   C 52 250, 92 248, 138 256
                   C 186 264, 233 280, 260 274"
                strokeWidth="2.2">
            <animate attributeName="stroke-dasharray" from="0,620" to="620,0" dur="3.9s" begin="0.4s" fill="freeze"/>
          </path>
          {/* Lower tail strand — fans downward */}
          <path d="M 264 242
                   C 208 248, 148 268, 95 300
                   C 58 322, 28 358, 14 396
                   C 52 368, 93 352, 144 350
                   C 192 348, 240 362, 258 350"
                strokeWidth="1.8" opacity="0.82">
            <animate attributeName="stroke-dasharray" from="0,620" to="620,0" dur="4.1s" begin="0.6s" fill="freeze"/>
          </path>
          {/* Wispy tail accent */}
          <path d="M 270 215 C 220 190, 162 166, 103 156 C 64 150, 30 156, 6 178"
                strokeWidth="1.2" opacity="0.55">
            <animate attributeName="stroke-dasharray" from="0,420" to="420,0" dur="3.5s" begin="0.9s" fill="freeze"/>
          </path>

          {/* ===== HINDQUARTERS — large powerful muscle mass ===== */}
          {/* Outer haunch curve */}
          <path d="M 268 218
                   C 256 252, 250 290, 255 325
                   C 260 350, 272 368, 296 376
                   C 316 382, 340 376, 356 364"
                strokeWidth="4" filter="url(#glow)">
            <animate attributeName="stroke-dasharray" from="0,340" to="340,0" dur="2.6s" begin="0.4s" fill="freeze"/>
          </path>
          {/* Inner haunch muscle highlight */}
          <path d="M 272 226 C 260 262, 256 300, 262 332 C 266 350, 276 364, 294 372"
                strokeWidth="2" opacity="0.52">
            <animate attributeName="stroke-dasharray" from="0,260" to="260,0" dur="2.1s" begin="0.8s" fill="freeze"/>
          </path>

          {/* ===== HIND LEGS — powerful extension backward ===== */}
          {/* Far hind (right hind) — most extended back */}
          <path d="M 302 364
                   C 286 396, 262 424, 240 452
                   C 226 470, 210 480, 200 495"
                strokeWidth="3.2">
            <animate attributeName="stroke-dasharray" from="0,310" to="310,0" dur="2.2s" begin="2.0s" fill="freeze"/>
          </path>
          {/* Near hind (left hind) — slightly tucked */}
          <path d="M 332 370
                   C 328 404, 328 436, 334 464
                   C 337 478, 342 488, 346 496"
                strokeWidth="2.6" opacity="0.7">
            <animate attributeName="stroke-dasharray" from="0,270" to="270,0" dur="2.2s" begin="2.2s" fill="freeze"/>
          </path>
          {/* Hock joint — far hind */}
          <path d="M 244 444 C 237 438, 226 440, 220 448"
                strokeWidth="2" opacity="0.78">
            <animate attributeName="stroke-dasharray" from="0,42" to="42,0" dur="0.7s" begin="2.6s" fill="freeze"/>
          </path>
          {/* Pastern/fetlock angle — far hind */}
          <path d="M 208 482 C 202 478, 196 482, 195 490"
                strokeWidth="1.8" opacity="0.7">
            <animate attributeName="stroke-dasharray" from="0,22" to="22,0" dur="0.5s" begin="2.7s" fill="freeze"/>
          </path>

          {/* ===== BODY — main structure ===== */}
          {/* Top-line / spine — thick, flowing */}
          <path d="M 268 218
                   C 348 200, 445 192, 532 196
                   C 578 198, 606 208, 620 225"
                strokeWidth="4.8" filter="url(#glow)">
            <animate attributeName="stroke-dasharray" from="0,530" to="530,0" dur="3.1s" fill="freeze"/>
          </path>
          {/* Belly / under-line — deep barrel */}
          <path d="M 272 226
                   C 292 315, 308 358, 350 376
                   C 388 392, 445 394, 496 388
                   C 540 382, 572 366, 588 348
                   C 602 332, 610 310, 610 288"
                strokeWidth="3.6">
            <animate attributeName="stroke-dasharray" from="0,720" to="720,0" dur="3.6s" begin="0.3s" fill="freeze"/>
          </path>
          {/* Chest/breast front */}
          <path d="M 620 225 C 628 252, 626 278, 618 302 C 614 318, 606 332, 595 342"
                strokeWidth="3.6">
            <animate attributeName="stroke-dasharray" from="0,190" to="190,0" dur="1.6s" begin="0.9s" fill="freeze"/>
          </path>

          {/* ===== SHOULDER muscle definition ===== */}
          <path d="M 600 230 C 612 262, 614 296, 605 326 C 600 342, 590 355, 576 362"
                strokeWidth="2.2" opacity="0.58">
            <animate attributeName="stroke-dasharray" from="0,210" to="210,0" dur="1.9s" begin="1.2s" fill="freeze"/>
          </path>
          {/* Girth depth line */}
          <path d="M 578 365 C 540 378, 492 382, 438 379 C 385 376, 342 364, 318 350"
                strokeWidth="1.6" opacity="0.48">
            <animate attributeName="stroke-dasharray" from="0,330" to="330,0" dur="2.0s" begin="1.5s" fill="freeze"/>
          </path>

          {/* ===== NECK — strong arched power ===== */}
          {/* Neck crest — top */}
          <path d="M 620 225
                   C 636 205, 655 186, 670 172
                   C 682 160, 698 155, 714 160"
                strokeWidth="4.2" filter="url(#glow)">
            <animate attributeName="stroke-dasharray" from="0,220" to="220,0" dur="2.1s" begin="1.0s" fill="freeze"/>
          </path>
          {/* Neck underside — throat depth */}
          <path d="M 608 294
                   C 622 278, 638 264, 655 256
                   C 668 249, 682 250, 694 258"
                strokeWidth="3.2" opacity="0.78">
            <animate attributeName="stroke-dasharray" from="0,190" to="190,0" dur="1.8s" begin="1.1s" fill="freeze"/>
          </path>
          {/* Neck muscle swell */}
          <path d="M 622 228 C 630 250, 632 272, 625 292"
                strokeWidth="1.8" opacity="0.48">
            <animate attributeName="stroke-dasharray" from="0,90" to="90,0" dur="1.0s" begin="1.6s" fill="freeze"/>
          </path>

          {/* ===== HEAD profile ===== */}
          {/* Head outer silhouette — forehead to muzzle */}
          <path d="M 714 160
                   C 738 154, 760 160, 776 178
                   C 788 192, 792 212, 790 234
                   C 788 254, 778 272, 762 283
                   C 748 292, 730 294, 716 290
                   C 704 286, 694 278, 690 268"
                strokeWidth="3.6" filter="url(#glow)">
            <animate attributeName="stroke-dasharray" from="0,430" to="430,0" dur="2.6s" begin="1.2s" fill="freeze"/>
          </path>
          {/* Muzzle front */}
          <path d="M 790 234 C 794 248, 792 265, 786 278 C 782 286, 774 292, 764 295"
                strokeWidth="2.6">
            <animate attributeName="stroke-dasharray" from="0,90" to="90,0" dur="1.0s" begin="2.1s" fill="freeze"/>
          </path>
          {/* Jaw line */}
          <path d="M 762 295 C 744 300, 724 298, 706 291"
                strokeWidth="2.0" opacity="0.68">
            <animate attributeName="stroke-dasharray" from="0,75" to="75,0" dur="0.8s" begin="2.2s" fill="freeze"/>
          </path>
          {/* Ear */}
          <path d="M 716 160 C 720 146, 728 138, 735 142 C 738 148, 736 158, 730 165"
                strokeWidth="2.2">
            <animate attributeName="stroke-dasharray" from="0,65" to="65,0" dur="0.8s" begin="2.3s" fill="freeze"/>
          </path>
          {/* Eye */}
          <circle cx="756" cy="200" r="4.8" fill="url(#mg)" stroke="url(#mg)" strokeWidth="0.5">
            <animate attributeName="opacity" values="0;0;1" dur="5s" keyTimes="0;0.86;1" fill="freeze"/>
          </circle>
          {/* Nostril */}
          <path d="M 786 254 C 790 249, 795 252, 793 258 C 791 263, 785 261, 786 254"
                strokeWidth="1.6" opacity="0.88">
            <animate attributeName="opacity" values="0;0;1" dur="5s" keyTimes="0;0.87;1" fill="freeze"/>
          </path>

          {/* ===== MANE — five flowing strands cascading back ===== */}
          <path d="M 714 160
                   C 692 136, 662 118, 628 114
                   C 598 110, 566 118, 538 134
                   C 512 148, 490 166, 468 176"
                strokeWidth="3.2">
            <animate attributeName="stroke-dasharray" from="0,460" to="460,0" dur="2.9s" begin="1.3s" fill="freeze"/>
          </path>
          <path d="M 708 170
                   C 684 148, 652 132, 618 128
                   C 590 124, 558 132, 532 148
                   C 508 162, 486 180, 464 188"
                strokeWidth="2.4" opacity="0.88">
            <animate attributeName="stroke-dasharray" from="0,430" to="430,0" dur="3.1s" begin="1.5s" fill="freeze"/>
          </path>
          <path d="M 700 182
                   C 676 163, 642 150, 608 148
                   C 578 146, 548 156, 522 172
                   C 500 186, 480 202, 460 208"
                strokeWidth="1.8" opacity="0.72">
            <animate attributeName="stroke-dasharray" from="0,400" to="400,0" dur="3.3s" begin="1.7s" fill="freeze"/>
          </path>
          <path d="M 690 192
                   C 664 178, 630 168, 596 168
                   C 566 168, 536 178, 510 194"
                strokeWidth="1.4" opacity="0.58">
            <animate attributeName="stroke-dasharray" from="0,360" to="360,0" dur="3.5s" begin="1.9s" fill="freeze"/>
          </path>
          <path d="M 678 202
                   C 650 190, 614 182, 578 184
                   C 548 186, 518 198, 495 214"
                strokeWidth="1.0" opacity="0.42">
            <animate attributeName="stroke-dasharray" from="0,310" to="310,0" dur="3.8s" begin="2.1s" fill="freeze"/>
          </path>

          {/* ===== FRONT LEGS — full forward extension ===== */}
          {/* Far front (right front) — leading, reaching furthest forward */}
          <path d="M 592 348
                   C 606 380, 626 412, 648 440
                   C 660 458, 675 472, 684 494"
                strokeWidth="3.2">
            <animate attributeName="stroke-dasharray" from="0,295" to="295,0" dur="2.2s" begin="1.9s" fill="freeze"/>
          </path>
          {/* Near front (left front) — slightly less extended */}
          <path d="M 570 358
                   C 566 392, 558 426, 548 456
                   C 542 473, 534 484, 528 497"
                strokeWidth="2.6" opacity="0.7">
            <animate attributeName="stroke-dasharray" from="0,268" to="268,0" dur="2.2s" begin="2.1s" fill="freeze"/>
          </path>
          {/* Knee joint — far front */}
          <path d="M 638 424 C 644 418, 652 420, 656 428"
                strokeWidth="2.0" opacity="0.8">
            <animate attributeName="stroke-dasharray" from="0,38" to="38,0" dur="0.6s" begin="2.5s" fill="freeze"/>
          </path>
          {/* Fetlock angle — far front */}
          <path d="M 672 468 C 678 464, 686 467, 686 475"
                strokeWidth="1.8" opacity="0.72">
            <animate attributeName="stroke-dasharray" from="0,24" to="24,0" dur="0.5s" begin="2.6s" fill="freeze"/>
          </path>

        </g>

        {/* Sparkle decorations */}
        <g fill="none" opacity="0">
          <animate attributeName="opacity" values="0;0.9;0.35;0.9;0.45" dur="5s" begin="4.0s" repeatCount="indefinite"/>
          <path d="M 766 126 L 771 117 L 776 126 L 785 131 L 776 136 L 771 145 L 766 136 L 757 131 Z"
                stroke="#d76d77" strokeWidth="1.2"/>
          <circle cx="435" cy="105" r="2.8" stroke="#ffaf7b" strokeWidth="1.5"/>
          <path d="M 145 134 L 149 127 L 153 134 L 160 138 L 153 142 L 149 149 L 145 142 L 138 138 Z"
                stroke="#6a4c9c" strokeWidth="1.0"/>
          <circle cx="695" cy="432" r="2.2" stroke="#ffaf7b" strokeWidth="1.0"/>
          <circle cx="192" cy="452" r="1.6" stroke="#d76d77" strokeWidth="1.0"/>
        </g>

        <style>{`
          .hh-wrap {
            display: inline-flex;
            align-items: center;
            vertical-align: middle;
          }
          .hh-svg {
            width: 120px;
            height: 75px;
            overflow: visible;
            filter: drop-shadow(0px 4px 10px rgba(122, 93, 167, 0.25));
          }
        `}</style>
      </svg>
    </div>
  );
}

export default HappyHorseIcon;
