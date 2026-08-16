import type { ReactNode } from "react";
import { CheckIcon, ErrorIcon, WarningIcon } from "./icon";

type BannerVariant = "error" | "warning" | "success" | "info";

const VARIANT_STYLES: Record<BannerVariant, string> = {
  error: "bg-red-50 text-red-900 border-red-200",
  warning: "bg-amber-50 text-amber-900 border-amber-200",
  success: "bg-emerald-50 text-emerald-900 border-emerald-200",
  info: "bg-slate-50 text-slate-900 border-slate-200",
};

const VARIANT_ICON: Record<BannerVariant, ReactNode> = {
  error: <ErrorIcon className="h-5 w-5 text-red-600" />,
  warning: <WarningIcon className="h-5 w-5 text-amber-600" />,
  success: <CheckIcon className="h-5 w-5 text-emerald-600" />,
  info: null,
};

const VARIANT_LABEL: Record<BannerVariant, string> = {
  error: "Error",
  warning: "Warning",
  success: "Success",
  info: "Info",
};

type BannerProps = {
  variant: BannerVariant;
  title: string;
  children?: ReactNode;
};

/** Status is conveyed by an icon + text label plus the color, never color
 * alone, so the banner still reads correctly for colorblind users or on a
 * grayscale render. */
export function Banner({ variant, title, children }: BannerProps) {
  return (
    <div role="status" className={`flex gap-3 rounded-md border p-3 text-sm ${VARIANT_STYLES[variant]}`}>
      {VARIANT_ICON[variant]}
      <div>
        <p className="font-medium">
          <span className="sr-only">{VARIANT_LABEL[variant]}: </span>
          {title}
        </p>
        {children ? <div className="mt-1 text-sm">{children}</div> : null}
      </div>
    </div>
  );
}
