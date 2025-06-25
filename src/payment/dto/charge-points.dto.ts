import { IsNumber, IsPositive, Min } from 'class-validator';

export class ChargePointsDto {
  @IsNumber()
  @IsPositive()
  @Min(1)
  amount: number;
}
