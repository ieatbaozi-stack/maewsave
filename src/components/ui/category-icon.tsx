import {
  Briefcase,
  Car,
  Coffee,
  Gift,
  HeartPulse,
  Home,
  Plane,
  ShoppingBag,
  Tag,
  Tv,
  Utensils,
  Wallet,
  Zap,
} from "lucide-react";

interface CategoryIconProps {
  icon: string | null | undefined;
  className?: string;
}

export function CategoryIcon({ icon, className = "h-5 w-5" }: CategoryIconProps) {
  switch (icon) {
    case "utensils":
      return <Utensils className={className} aria-hidden="true" />;
    case "coffee":
      return <Coffee className={className} aria-hidden="true" />;
    case "car":
      return <Car className={className} aria-hidden="true" />;
    case "shopping-bag":
      return <ShoppingBag className={className} aria-hidden="true" />;
    case "home":
      return <Home className={className} aria-hidden="true" />;
    case "heart-pulse":
      return <HeartPulse className={className} aria-hidden="true" />;
    case "tv":
      return <Tv className={className} aria-hidden="true" />;
    case "plane":
      return <Plane className={className} aria-hidden="true" />;
    case "zap":
      return <Zap className={className} aria-hidden="true" />;
    case "wallet":
      return <Wallet className={className} aria-hidden="true" />;
    case "briefcase":
      return <Briefcase className={className} aria-hidden="true" />;
    case "gift":
      return <Gift className={className} aria-hidden="true" />;
    default:
      return <Tag className={className} aria-hidden="true" />;
  }
}
