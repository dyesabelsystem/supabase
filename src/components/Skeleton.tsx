import React from 'react';

interface SkeletonProps {
  className?: string;
}

const joinClasses = (...values: Array<string | undefined | false>) =>
  values.filter(Boolean).join(' ');

const hasExplicitRadius = (className?: string) =>
  String(className || '')
    .split(/\s+/)
    .some((classToken) => /(^|:)rounded(?:-|$)/.test(classToken));

export const SkeletonBlock: React.FC<SkeletonProps> = ({ className }) => (
  <div
    className={joinClasses('skeleton-shimmer', !hasExplicitRadius(className) && 'rounded-xl', className)}
    aria-hidden="true"
  />
);

export const SkeletonCircle: React.FC<SkeletonProps> = ({ className }) => (
  <SkeletonBlock className={joinClasses('rounded-full', className)} />
);
