import { IsString, IsUUID, MinLength } from 'class-validator';

/** Body of POST /api/reset-password. */
export class ResetPasswordDto {
  /** Whose password to change. */
  @IsUUID('4', { message: 'userId must be a valid id' })
  userId!: string;

  // Same minimum as registration, so a reset cannot be used to set a weaker
  // password than sign-up would have allowed.
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;
}
