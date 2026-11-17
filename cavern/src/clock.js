// Physics time never depends on the monitor refresh rate. After a long frame,
// discarded wall time is counted rather than fed into an unstable large step.
export class FixedClock {
  constructor(step=1/120,maxSteps=8){this.step=step;this.maxSteps=maxSteps;this.accumulator=0;this.dropped=0;this.ticks=0;}
  reset(){this.accumulator=0;this.dropped=0;this.ticks=0;}
  advance(seconds,tick){
    if(!Number.isFinite(seconds)||seconds<=0)return 0;
    this.accumulator+=seconds;let n=0;
    while(this.accumulator+1e-10>=this.step&&n<this.maxSteps){tick(this.step);this.accumulator-=this.step;this.ticks++;n++;}
    if(this.accumulator>=this.step){const dropped=Math.floor(this.accumulator/this.step)*this.step;this.accumulator-=dropped;this.dropped+=dropped;}
    return n;
  }
  get alpha(){return Math.max(0,Math.min(1,this.accumulator/this.step));}
}
