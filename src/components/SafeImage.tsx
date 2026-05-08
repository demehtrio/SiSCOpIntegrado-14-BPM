import React from 'react';
import { cn } from '@/src/lib/utils';

interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallback?: string;
}

export const SafeImage: React.FC<SafeImageProps> = ({ src, className, alt, fallback, ...props }) => {
  const [error, setError] = React.useState(false);

  if (!src || error) {
    if (fallback) {
       return <img src={fallback} className={cn("object-contain", className)} alt={alt} {...props} />;
    }
    return null;
  }

  return (
    <img
      src={src}
      className={cn("object-contain", className)}
      alt={alt}
      onError={() => setError(true)}
      referrerPolicy="no-referrer"
      {...props}
    />
  );
};
