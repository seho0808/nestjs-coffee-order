import {
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
  Headers,
  BadRequestException,
  Get,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PointTransaction } from './point-transaction.entity';
import { ChargePointsDto, DeductPointsDto } from './dto';
import { v4 as uuidv4 } from 'uuid';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

@Controller('users')
@UsePipes(new ValidationPipe({ transform: true }))
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @ApiOperation({ summary: '포인트 충전' })
  @ApiResponse({
    status: 200,
    description: '포인트 충전 성공',
    type: PointTransaction,
  })
  @Post(':userId/points/charge')
  async chargePoints(
    @Param('userId') userId: string,
    @Body() chargePointsDto: ChargePointsDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PointTransaction> {
    // idempotency key가 없으면 자동 생성
    const key = idempotencyKey || uuidv4();

    if (!key || key.trim().length === 0) {
      throw new BadRequestException('Idempotency key is required');
    }

    return this.paymentService.chargePoints(
      userId,
      chargePointsDto.amount,
      key,
    );
  }

  @Post(':userId/points/deduct')
  @ApiOperation({ summary: '포인트 차감' })
  @ApiResponse({
    status: 200,
    description: '포인트 차감 성공',
    type: PointTransaction,
  })
  async deductPoints(
    @Param('userId') userId: string,
    @Body() deductPointsDto: DeductPointsDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PointTransaction> {
    // idempotency key가 없으면 자동 생성
    const key = idempotencyKey || uuidv4();

    if (!key || key.trim().length === 0) {
      throw new BadRequestException('Idempotency key is required');
    }

    return this.paymentService.deductPoints(
      userId,
      deductPointsDto.amount,
      key,
    );
  }

  @Get(':userId/points')
  async getUserPoints(
    @Param('userId') userId: string,
  ): Promise<{ points: number }> {
    const points = await this.paymentService.getUserPoints(userId);
    return { points };
  }

  @Get(':userId/points/transactions')
  async getPointTransactions(
    @Param('userId') userId: string,
  ): Promise<PointTransaction[]> {
    return this.paymentService.getPointTransactions(userId);
  }
}
