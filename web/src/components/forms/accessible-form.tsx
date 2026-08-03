import * as React from "react";

export interface AccessibleFormProps extends React.FormHTMLAttributes<HTMLFormElement> {
  labelledBy: string;
}

export function AccessibleForm({ labelledBy, ...props }: AccessibleFormProps) {
  return <form aria-labelledby={labelledBy} {...props} />;
}
