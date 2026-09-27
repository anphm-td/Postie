import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="top-center"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'font-sans',
          title: 'font-medium'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
