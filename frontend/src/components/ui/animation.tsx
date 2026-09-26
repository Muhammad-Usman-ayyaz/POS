"use client"

import * as React from 'react';
import { cn } from 'cn';

// Page Transition Component
interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <div className={cn('animate-slide-up-fade', className)}>
      {children}
    </div>
  );
}

// Stagger Container Component
interface StaggerContainerProps {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
}

export function StaggerContainer({ children, className, staggerDelay = 0.05 }: StaggerContainerProps) {
  const childrenArray = React.Children.toArray(children);
  
  return (
    <div className={cn('stagger-container', className)}>
      {childrenArray.map((child, index) => (
        <div key={index} style={{ animationDelay: `${staggerDelay * index}s` }}>
          {child}
        </div>
      ))}
    </div>
  );
}

// Animated Card Component
interface AnimatedCardProps {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
}

export function AnimatedCard({ children, className, interactive = true }: AnimatedCardProps) {
  return (
    <div className={cn(
      'animate-fade-in-up',
      interactive && 'interactive erp-card-hover',
      className
    )}>
      {children}
    </div>
  );
}

// Animated Button Component
interface AnimatedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'primary' | 'secondary';
}

export function AnimatedButton({ children, className, variant = 'default', ...props }: AnimatedButtonProps) {
  const baseClass = 'interactive erp-btn-press';
  const variantClass = {
    default: 'bg-primary text-on-primary hover:bg-primary-container',
    primary: 'bg-primary-container text-primary hover:bg-primary',
    secondary: 'bg-surface-container-low text-on-surface hover:bg-surface-container',
  }[variant];

  return (
    <button
      className={cn(baseClass, variantClass, className)}
      {...props}
    >
      {children}
    </button>
  );
}

// Animated Modal Component
interface AnimatedModalProps {
  children: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

export function AnimatedModal({ children, isOpen, onClose, className }: AnimatedModalProps) {
  React.useEffect(() => {
    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm animate-fade-in-up"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative w-full max-w-2xl mx-4 p-6 rounded-xl glass-modal animate-scale-fade',
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}

// Animated Table Component
interface AnimatedTableProps {
  children: React.ReactNode;
  className?: string;
}

export function AnimatedTable({ children, className }: AnimatedTableProps) {
  return (
    <div className={cn('overflow-hidden', className)}>
      <table className="w-full">
        {children}
      </table>
    </div>
  );
}

// Toast/Notification Component
interface ToastProps {
  message: string;
  isVisible: boolean;
  onClose: () => void;
  className?: string;
}

export function Toast({ message, isVisible, onClose, className }: ToastProps) {
  React.useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        'fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 font-label-md text-label-md',
        'bg-primary text-on-primary border border-primary-fixed/40 animate-toast-enter',
        className
      )}
    >
      <span className="material-symbols-outlined text-[18px]">check_circle</span>
      <span>{message}</span>
    </div>
  );
}

// Sidebar Navigation Component
interface SidebarNavProps {
  children: React.ReactNode;
  className?: string;
}

export function SidebarNav({ children, className }: SidebarNavProps) {
  return (
    <nav
      className={cn(
        'w-72 bg-surface-container-lowest border-r border-outline-variant/30 p-4',
        'animate-slide-in-left',
        className
      )}
    >
      {children}
    </nav>
  );
}

// Animated Dropdown Component
interface AnimatedDropdownProps {
  children: React.ReactNode;
  isOpen: boolean;
  className?: string;
}

export function AnimatedDropdown({ children, isOpen, className }: AnimatedDropdownProps) {
  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'absolute top-full right-0 mt-2 w-56 rounded-lg glass-dropdown dropdown-enter z-50',
        className
      )}
    >
      {children}
    </div>
  );
}