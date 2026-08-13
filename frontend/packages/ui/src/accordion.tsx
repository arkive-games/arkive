"use client"

import * as React from "react"
import { IconChevronDown } from "@tabler/icons-react"
import { Accordion as AccordionPrimitive } from "radix-ui"

import { cn } from "./utils"

function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  )
}

function AccordionTrigger({
  className,
  children,
  hideChevron = false,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger> & { hideChevron?: boolean }) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-colors duration-[var(--arkive-motion-standard)] outline-none hover:underline focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
          // Only the built-in chevron is rotated. The rule matches any direct
          // `>svg`, so with hideChevron a caller's own icons were rotated too --
          // an explicit "up" icon flipped to point down and vice versa, leaving
          // both states pointing the same way.
          !hideChevron && "[&[data-state=open]>svg]:rotate-180",
          className
        )}
        {...props}
      >
        {children}
        {!hideChevron ? (
          <IconChevronDown
            className="pointer-events-none size-4 shrink-0 translate-y-0.5 text-muted-foreground transition-transform duration-[var(--arkive-motion-standard)]"
            stroke={1.8}
          />
        ) : null}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
      {...props}
    >
      <div className={cn("pt-0 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
