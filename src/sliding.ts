import { SlidingUI } from './sliding/SlidingUI';
import './sliding.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = '';

new SlidingUI(app);

console.log('Sliding Puzzle initialized!');
