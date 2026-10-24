// The "See how it works" figures (HAR-34): one self-contained page per taxonomy
// topic, src/figures/<topicId>.html, built from tools/figures/<topicId>.js by
// scripts/build-figures.mjs. docs/FIGURES.md explains how to add one.
// title names the figure (the iframe's title); hint is one line for the
// grown-up or child under it, saying what to press.
export const FIGURES = {
  'mt_B3W5EfimJw': { title: 'Toy cart', hint: 'Push the cart, pull it back, then load it up and push again.' },
  'mt_iGSfQg3g5c': { title: 'Ice in the sun', hint: 'Let the sun shine, put up the shade, and watch which ice melts first.' },
  'mt_zCGwH1OQZa': { title: 'Pot with a cold lid', hint: 'Heat the water, then put the cold lid on and see the drops form.' },
  'mt_DA7-JYRvtP': { title: 'Simple circuit', hint: 'Join each wire, one at a time, until the bulb lights.' },
  'mt_Hah24nbToi': { title: 'Flashlight switch', hint: 'Slide the switch on and off, or take a battery out.' },
  'mt_NNNbPccwB4': { title: 'Bulb tester', hint: 'Put something in the gap and see if the bulb lights up.' },
  'mt_9NvuqZKNiV': { title: 'Magnet and objects', hint: 'Lower the magnet over each thing and lift it to see what sticks.' },
  'mt_jgNB2752b9': { title: 'Two magnets', hint: 'Push the cart toward the other magnet, then flip one and try again.' },
  'mt_SZJ1mN7Vfk': { title: 'Bee and flowers', hint: 'Fly the bee to one flower, then the next, and watch the seeds grow.' },
  'mt_HZvTriQWTh': { title: 'Weather station', hint: 'Make it sunny, rainy or windy and watch each tool change.' },
};

// The figure for a topic id, or null. src is relative to the app page.
export function figureFor(topicId) {
  if (!Object.hasOwn(FIGURES, topicId)) return null;
  return { id: topicId, ...FIGURES[topicId], src: `figures/${topicId}.html` };
}
