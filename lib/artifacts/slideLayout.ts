export async function waitForSlideLayout(doc: Document): Promise<void> {
  await doc.fonts?.ready;
  await Promise.all(Array.from(doc.images).map((image) => image.decode().catch(() => {})));
}

/** Text and media are checked against the slide and any clipping container, not decorative backgrounds or shadows. */
export function readSlideOverflow(doc: Document): number[] {
  const view = doc.defaultView;
  if (!view) return [];
  const tolerance = 1;
  const styles = new Map<Element, CSSStyleDeclaration>();
  const styleOf = (element: Element) => {
    let style = styles.get(element);
    if (!style) {
      style = view.getComputedStyle(element);
      styles.set(element, style);
    }
    return style;
  };
  const outside = (rect: DOMRect, bounds: DOMRect, x = true, y = true) =>
    (x && (rect.left < bounds.left - tolerance || rect.right > bounds.right + tolerance)) ||
    (y && (rect.top < bounds.top - tolerance || rect.bottom > bounds.bottom + tolerance));

  return Array.from(doc.querySelectorAll("body > section")).flatMap((slide, index) => {
    const bounds = slide.getBoundingClientRect();
    const clipped = (rect: DOMRect, element: Element): boolean => {
      if (!rect.width || !rect.height) return false;
      if (outside(rect, bounds)) return true;
      for (let parent: Element | null = element; parent && parent !== slide; parent = parent.parentElement) {
        const style = styleOf(parent);
        const clipsX = /^(hidden|clip|scroll|auto)$/.test(style.overflowX);
        const clipsY = /^(hidden|clip|scroll|auto)$/.test(style.overflowY);
        if ((clipsX || clipsY) && outside(rect, parent.getBoundingClientRect(), clipsX, clipsY)) return true;
      }
      return false;
    };
    const visible = (element: Element) =>
      !element.closest("aside.notes, [hidden], style, script, template") &&
      !["hidden", "collapse"].includes(styleOf(element).visibility);
    const text = doc.createTreeWalker(slide, 4);
    for (let node = text.nextNode(); node; node = text.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !node.textContent?.trim() || !visible(parent)) continue;
      const range = doc.createRange();
      range.selectNodeContents(node);
      if (clipped(range.getBoundingClientRect(), parent)) return [index];
    }
    for (const media of slide.querySelectorAll("img, svg, video, canvas")) {
      if (visible(media) && clipped(media.getBoundingClientRect(), media)) return [index];
    }
    return [];
  });
}
