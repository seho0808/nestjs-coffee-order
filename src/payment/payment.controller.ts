import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PointTransaction } from './point-transaction.entity';

@Controller('users')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post(':userId/points/charge')
  async chargePoints(
    @Param('userId') userId: string,
    @Body('amount') amount: number,
  ): Promise<PointTransaction> {
    return this.paymentService.chargePoints(userId, amount);
  }
}
