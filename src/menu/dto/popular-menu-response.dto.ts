import { ApiProperty } from '@nestjs/swagger';
import { MenuResponseDto } from './menu-response.dto';
import { Type } from 'class-transformer';
import { IsNumber, IsArray, ValidateNested } from 'class-validator';

export class PopularMenuItemDto {
  @ApiProperty({
    description: '메뉴 정보',
    type: MenuResponseDto,
  })
  @Type(() => MenuResponseDto)
  menu: MenuResponseDto;

  @ApiProperty({
    description: '주간 주문 수',
    example: 10,
  })
  @IsNumber()
  orderCount: number;

  constructor(menu: MenuResponseDto, orderCount: number) {
    this.menu = menu;
    this.orderCount = orderCount;
  }
}

export class PopularMenuResponseDto {
  @ApiProperty({
    description: '인기 메뉴 목록',
    type: [PopularMenuItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PopularMenuItemDto)
  popularMenus: PopularMenuItemDto[];

  constructor(popularMenus: PopularMenuItemDto[]) {
    this.popularMenus = popularMenus;
  }
}
