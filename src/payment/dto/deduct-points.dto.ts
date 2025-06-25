import { IsNumber, IsPositive, Min } from 'class-validator';

export class DeductPointsDto {
  @IsNumber()
  @IsPositive()
  @Min(1)
  amount: number;
}
