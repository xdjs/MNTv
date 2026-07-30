import "@testing-library/jest-dom";

// jsdom implements neither of these on Element, so any component that
// scrolls a container programmatically (e.g. the immersive view's
// swipe-up cue) throws an uncaught TypeError mid-test. Real browsers
// have both — stub them rather than guarding product code for jsdom.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
