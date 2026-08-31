type PreviewPopup = {
  location: { replace: (href: string) => void };
  close: () => void;
  opener: unknown;
};

type PreviewBrowser = {
  open: (url: string, target: string) => PreviewPopup | null;
  location: { assign: (href: string) => void };
};

type PreparedPreviewWindow = {
  show: (href: string) => void;
  cancel: () => void;
};

function currentBrowser(): PreviewBrowser {
  return {
    open: (url, target) => window.open(url, target),
    location: window.location,
  };
}

export function preparePreviewWindow(
  browser: PreviewBrowser = currentBrowser()
): PreparedPreviewWindow {
  const popup = browser.open("about:blank", "_blank");
  if (!popup) {
    return {
      show: (href) => browser.location.assign(href),
      cancel: () => undefined,
    };
  }

  popup.opener = null;
  return {
    show: (href) => popup.location.replace(href),
    cancel: () => popup.close(),
  };
}
