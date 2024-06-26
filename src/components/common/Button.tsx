import clsx from 'clsx'
import { ElementType, forwardRef, ReactNode } from 'react'
import Spinner from './Spinner'

interface OwnButtonProps {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'tertiary-danger' | 'danger'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  leftIcon?: JSX.Element
  rightIcon?: JSX.Element
  outline?: boolean
  fullWidth?: boolean
  loading?: boolean
  disabled?: boolean
  children?: ReactNode
  onClick?: () => void
  as?: ElementType
  href?: string
}

// Define the additional props allowed when the element is a 'button'
interface ButtonElementProps extends OwnButtonProps {
  type?: 'button' | 'submit' | 'reset'
}

type ButtonProps<T extends ElementType> = T extends 'button'
  ? ButtonElementProps
  : OwnButtonProps

const Button = forwardRef<ElementType, ButtonProps<ElementType>>(
  (
    {
      variant = 'primary',
      size = 'md',
      leftIcon,
      rightIcon,
      outline,
      fullWidth,
      loading,
      disabled,
      children,
      as: Element = 'button',
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading
    return (
      <Element
        {...props}
        ref={ref}
        disabled={isDisabled}
        className={clsx(
          'inline-flex items-center justify-center border font-medium capitalize shadow-sm focus:outline-none',
          {
            // Variants
            // When creating a new variant, base it off of the primary variant.

            // Primary
            // Solid
            'border-transparent bg-teal-500 text-white dark:bg-teal-500 dark:hover:bg-teal-400':
              variant === 'primary' && !outline,
            'hover:border-transparent hover:bg-teal-400 focus:bg-teal-400 active:border-transparent active:bg-teal-600':
              variant === 'primary' && !outline && !isDisabled,
            // Primary
            // Outline
            'border-teal-400 text-teal-400': variant === 'primary' && outline,
            'hover:border-teal-400 hover:text-teal-400 focus:border-teal-400 focus:text-teal-400 active:border-teal-600 active:text-teal-600':
              variant === 'primary' && outline && !isDisabled,

            // Secondary
            // Solid
            'border-transparent bg-gray-200 text-gray-900':
              variant === 'secondary' && !outline,
            'hover:border-transparent hover:bg-gray-300 focus:bg-gray-300 active:border-transparent active:bg-gray-400':
              variant === 'secondary' && !outline && !isDisabled,

            // Secondary
            // Outline
            'border-gray-300 text-gray-900': variant === 'secondary' && outline,
            'hover:border-gray-200 focus:border-gray-200 active:border-gray-300':
              variant === 'secondary' && outline && !isDisabled,

            // Tertiary
            // Solid
            'border-transparent bg-gray-100 text-teal-400':
              variant === 'tertiary' && !outline,
            'hover:border-transparent hover:text-teal-400 focus:text-teal-400 active:border-transparent active:text-teal-400':
              variant === 'tertiary' && !outline && !isDisabled,

            // Tertiary
            // Outline
            'border-gray-200 text-teal-400': variant === 'tertiary' && outline,
            'hover:text-teal-400 focus:text-teal-400 active:text-teal-400':
              variant === 'tertiary' && outline && !isDisabled,

            // Tertiary Danger
            // Solid
            'border-transparent bg-gray-100 text-red-500':
              variant === 'tertiary-danger' && !outline,
            'hover:border-transparent hover:text-red-400 focus:text-red-400 active:border-transparent active:text-red-500':
              variant === 'tertiary-danger' && !outline && !isDisabled,

            // Tertiary Danger
            // Outline
            'border-gray-200 text-red-500':
              variant === 'tertiary-danger' && outline,
            'hover:text-red-400 focus:text-red-400 active:text-red-500':
              variant === 'tertiary-danger' && outline && !isDisabled,

            // Danger
            // Solid
            'border-transparent bg-red-500 text-white':
              variant === 'danger' && !outline,
            'hover:border-transparent hover:bg-red-400 focus:bg-red-400 active:border-transparent active:bg-red-700':
              variant === 'danger' && !outline && !isDisabled,

            // Danger
            // Outline
            'border-red-500 text-red-500': variant === 'danger' && outline,
            'hover:border-red-400 hover:text-red-400 focus:border-red-400 focus:text-red-400 active:border-red-600 active:text-red-600':
              variant === 'danger' && outline && !isDisabled,

            // Size
            'rounded px-2.5 py-1.5 text-xs': size === 'xs',
            'rounded-md px-3 py-2 text-sm leading-4': size === 'sm',
            'rounded-md px-4 py-2 text-base sm:text-sm': size === 'md',
            'rounded-md px-4 py-2 text-base': size === 'lg',
            'rounded-md px-6 py-3 text-base': size === 'xl',

            // Width
            'w-full': fullWidth,

            // Disabled
            'cursor-pointer': !isDisabled,
            'cursor-not-allowed opacity-50': isDisabled,
          },
        )}
      >
        {!leftIcon && !rightIcon && loading && (
          <span
            role="img"
            className={clsx('-ml-1 mr-2 flex-shrink-0', {
              'h-4 w-4': ['xs', 'sm'].includes(size),
              'h-5 w-5': ['md', 'lg', 'xl'].includes(size),
            })}
          >
            <Spinner />
          </span>
        )}
        {leftIcon && (
          <span
            role="img"
            className={clsx('-ml-1 mr-2 flex-shrink-0', {
              'h-4 w-4': ['xs', 'sm'].includes(size),
              'h-5 w-5': ['md', 'lg', 'xl'].includes(size),
            })}
          >
            {loading ? <Spinner /> : leftIcon}
          </span>
        )}
        {children}
        {rightIcon && (
          <span
            role="img"
            className={clsx('-mr-1 ml-2 flex-shrink-0', {
              'h-4 w-4': ['xs', 'sm'].includes(size),
              'h-5 w-5': ['md', 'lg', 'xl'].includes(size),
            })}
          >
            {loading ? <Spinner /> : rightIcon}
          </span>
        )}
      </Element>
    )
  },
)

Button.displayName = 'Button'

export default Button
