import type { ButtonHTMLAttributes } from "react";
import { cn } from "#/lib/cn";

const variants = {
	primary: "bg-primary text-primary-foreground hover:bg-primary/90",
	outline: "border border-input bg-background hover:bg-accent",
	ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: keyof typeof variants;
}

/**
 * Every button is at least 44px tall: a respondent on a phone presses these with a thumb, and
 * that is the size WCAG's target-size criterion asks for at its stricter level.
 */
export function Button({ variant = "primary", className, type = "button", ...props }: ButtonProps) {
	return (
		<button
			type={type}
			className={cn(
				"inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-base font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none",
				variants[variant],
				className,
			)}
			{...props}
		/>
	);
}
