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
}: {
  children: ReactNode;
  name: string;
}) {
  return (
    <ViewTransition name={name} share="entry-title" default="none">
      {children}
    </ViewTransition>
  );
}
