import React, { Component, ErrorInfo, ReactNode } from 'react';
interface Props {
    children: ReactNode;
}
interface State {
    hasError: boolean;
}
declare class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props);
    static getDerivedStateFromError(_: Error): State;
    componentDidCatch(error: Error, errorInfo: ErrorInfo): void;
    render(): string | number | boolean | Iterable<React.ReactNode> | React.JSX.Element | null | undefined;
}
export default ErrorBoundary;
