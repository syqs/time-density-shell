import { BoxProps } from '@mui/material/Box';
import { SxProps, Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

export type LabelColor =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'info'
  | 'success'
  | 'warning'
  | 'error';

export type LabelVariant = 'filled' | 'outlined' | 'soft';

// export interface LabelProps extends BoxProps {
//   startIcon?: React.ReactElement | null;
//   endIcon?: React.ReactElement | null;
//   color?: LabelColor;
//   variant?: LabelVariant;
// }

export interface LabelProps extends BoxProps {
  children: React.ReactNode;
  color?: 'default' | 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
  variant?: 'filled' | 'outlined' | 'soft';
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  sx?: SxProps<Theme>;
  [key: string]: any; // Allow additional props
}