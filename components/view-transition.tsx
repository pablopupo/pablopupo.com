import { Fragment, type ReactNode } from "react";
import * as React from "react";

type ViewTransitionClass = string | Record<string, string>;

type ViewTransitionProps = {
  children: ReactNode;
  name?: string;
  default?: ViewTransitionClass;
  enter?: ViewTransitionClass;
  exit?: ViewTransitionClass;
  share?: ViewTransitionClass;
  update?: ViewTransitionClass;
};

type ViewTransitionComponent = (props: ViewTransitionProps) => ReactNode;

const NativeViewTransition = (
  React as typeof React & {
    ViewTransition?: ViewTransitionComponent;
  }
).ViewTransition;

export default function ViewTransition(props: ViewTransitionProps) {
  if (!NativeViewTransition) {
    return <Fragment>{props.children}</Fragment>;
  }

  return <NativeViewTransition {...props} />;
}

export function NamedViewTransition({
  children,
  name,
  shareClass = "entry-title",
}: {
  children: ReactNode;
  name: string;
  shareClass?: string;
}) {
  return (
    <ViewTransition
      name={name}
      share={{
        default: shareClass,
        "from-connections": "none",
        "section-forward": "none",
        "section-back": "none",
      }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}

export function BrandViewTransition({ children }: { children: ReactNode }) {
  return <ViewTransition name="accordo-wordmark" share={{ default: "brand-mark", "from-connections": "none", "from-home": "none", "to-home": "none", "section-forward": "none", "section-back": "none" }} default="none">
    {children}
  </ViewTransition>;
}
