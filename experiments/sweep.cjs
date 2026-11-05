// Run from any directory with node experiments/sweep.cjs.
const fs = require('node:fs');
const path = require('node:path');
const {config, Simulation} = require('../engine.js');
const rows = ['scene,speed_mps,cycle_multiplier,policy,stop_min,late,products,distance_m,max_station_stop_min,required_vehicle_load'];
for (const scene of ['steady', 'surge', 'tight']) {
    for (const speed of [0.4, 0.5, 0.8, 1, 2]) {
        for (const multiplier of [0.75, 1, 1.25]) {
            const inputs = config(scene, speed);
            inputs.period = inputs.period.map(seconds => seconds * multiplier);
            inputs.surgePeriod = 16 * multiplier;
            // Steady-state vehicle-time demand. Surge uses the post-change rate.
            const periods = [...inputs.period];
            if (scene === 'surge') periods[1] = inputs.surgePeriod;
            const load = periods.reduce((total, seconds, i) =>
                total + (inputs.load + inputs.unload + 2 * inputs.distance[i] / speed) / (inputs.box * seconds), 0);
            for (const policy of ['fifo', 'risk', 'aging']) {
                const simulation = new Simulation(inputs, policy).run();
                const result = simulation.metrics();
                const maxStop = Math.max(...simulation.stations.map(station => station.stop / 60));
                rows.push([scene, speed, multiplier, policy, result.stop, result.late,
                    result.produced, result.distance, maxStop, load].join(','));
            }
        }
    }
}
fs.writeFileSync(path.join(__dirname, 'sweep_reference.csv'), rows.join('\n') + '\n');
console.log('Saved all 135 runs across 45 paired conditions.');
