/** Minimal Obsidian module for the browser preview bundle. */
export class MarkdownView {}
export class Notice {
  constructor(message) {
    this.message = message;
  }
}
export class Modal {}
export class Setting {}
export const Platform = {
  isMobile: true,
  isMobileApp: true,
  isDesktop: false,
};
